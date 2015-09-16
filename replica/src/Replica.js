"use strict";
var stream_url = require('stream-url');
var levelup = require('level');
var stamp = require('swarm-stamp');
var AnchoredVV = stamp.AnchoredVV;

var sync     = require('swarm-syncable');
var Spec = sync.Spec;
var Op = sync.Op;
var OpStream = sync.OpStream;
var Request  = require('./Request');

// Swarm database node backed by an ordered op storage
// Has an object stream based interface.
// Consumes ops, emits ops that need to be delivered to their op.source.
// For the actual object subscription/ op propagation
// logic see Subscription.js.
function Replica (options, callback) {
    var self = this;
    this.options = options = options || {};
    var db;
    if (!options.db) {
        var memdown = require('memdown');
        if (!memdown) { throw new Error('no memdown!'); }
        db = levelup(memdown);
    } else {
        db = options.db;
    }
    this.entries = {};
    this.servers = {};
    this.streams = {};
    this.ssn_id = options.ssn_id || null;
    this.db_id = options.db_id || null;
    if (options.clock) {
        this.clock = options.clock;
    } else if (this.ssn_id) {
        this.clock = new stamp.Clock(this.ssn_id);
    } else { // wait db read
        this.clock = null;
    }
    this.prefix = options.prefix || '';
    this.bound_write = self.write.bind(self);
    this.db = null;
    db.get( '.hs', function onDbRead (err, value) {
        if (err) {
            if (err.name!=='NotFoundError') {
                callback && callback('db error: '+err.name);
                return;
            }
            if (!self.db_id || !self.ssn_id) {
                callback && callback('not initialized');
                return;
            }
        } else {
            var hs = new Spec(value);
            if (!self.ssn_id) {
                self.ssn_id = hs.origin();
            }
            if (!self.db_id) {
                self.db_id = hs.id(); // TODO shard
            }
            if (!self.clock) {
                self.clock = new stamp.Clock(self.ssn_id);
            }
            self.clock.seeTimestamp(hs.stamp());
        }
        self.db = db;
        if (self.prefix===true) {
            self.prefix = '*'+self.db_id;
        }
        db.put('.hs', self.handshake());
        if (options.listen) {
            self.listen(options.listen, options, callback);
        } else {
            callback && callback();
        }
    });
}
module.exports = Replica;


function ObjectMetaInfo (map) {
    this.subscriptions = [];
    this.pending_ops = null;
    // own progress
    this.tip = '0';
    this.state = '';
    // upstream progress
    this.last = '0';
    this.avv = '0';
    // e.g. non-upstream bookmarks
    this.other = null;
}



// Q  upstream selection, subs maintainance
// Q stream listeners


// Cleans up cached info, objects with no active subscriptions, etc
Replica.prototype.gc = function () {
    var typeids = Object.keys(this.subscriptions), typeid;
    while (typeid = typeids.pop()) {
        if ( ! (typeid in this.write_queues) ) {
            var sub = this.subscriptions[typeid];
            if (!sub.subscriberCount()) {
                delete this.subscriptions[typeid];
            } else {
                sub.gc();
            }
        }
    }
};

//
Replica.prototype.write = function (op, callback) {
    if (op.constructor!==Op) {
        throw new Error('consumes swarm-syncable.Op objects only');
    }
    if (op.spec.pattern()!=='/#!.') {
        this.send(op.error('invalid op'));
        this.removeStream(op.source);
        return;
    }
    var typeid = op.typeid();
    var meta = this.entries[typeid];
    if (meta===undefined) {
        meta = this.entries[typeid] = new ObjectMetaInfo();
        meta.pending_ops = [op];
        this.loadMeta(typeid, meta);
    } else if (meta.pending_ops===null) {
        meta.pending_ops = [op];
        this.next(meta);
    } else {
        meta.pending_ops.push(op);
    }
    callback && callback(); // TODO [op], callback on commit/response
};


Replica.prototype.send = function (op) {
    var stream = this.streams[op.source];
    if (stream) {
        stream.write(op);
    } else {
        console.warn('op sent nowhere', op);
    }
};


Replica.prototype.done = function (request) {
    var self = this;
    var typeid = request.typeid;
    // first, save to db
    if (request.save_queue.length) {
        var batch = [];
        var key_prefix = this.prefix + request.typeid;
        request.save_queue.forEach(function(o){
            batch.push({
                type:  o.value===null ? 'del' : 'put',
                key:   key_prefix+o.spec.toString(),
                value: o.value
            });
        });
        this.db.batch(batch, send_ops);
    } else {
        send_ops();
    }
    // second, send responses
    function send_ops (err) {
        if (err) {
            // must not send anything but an error
            // an acknowledgement for a non-saved op will ruin sync
            self.send(request.op.error('db write error'));
            // TODO EXIT stop everything, terminate the process
        } else {
            var queue = request.send_queue;
            for(var i=0; i<queue.length; i++) {
                self.send(queue[i]);
            }
        }
        self.next(typeid);
    }
};


Replica.prototype.next = function (typeid) {
    var meta = this.entries[typeid];
    if (meta.pending_ops!==null && meta.pending_ops.length) {
        var next_req = new Request(this, meta, meta.pending_ops.shift());
        next_req.process();
    } else {
        meta.pending_ops = null;
    }
};


Replica.prototype.loadMeta = function (typeid, meta) {
    var self = this;
    this.loadTail(typeid, '.', parseMeta);
    function parseMeta (error, ops) {
        if (error) {
            console.error('db read error', error);
            self.close();
        }
        ops.forEach(function(op){
            switch (op.spec.toString()) {
            case '.tip':   meta.tip = op.value; break;
            case '.last':  meta.last = op.value; break;
            case '.avv':   meta.avv = op.value; break;
            case '.state': meta.state = op.value; break;
            //case '.subs': meta. = op.value; break;
            default: console.warn();
            }
        });
        self.next(typeid);
    }
};


Replica.prototype.close = function (err, callback) {
    this.db.close();
    this.db = null;
};


//        D A T A B A S E        //


Replica.prototype.loadInitData = function () {
    var self = this, options = this.options;
    this.db.createReadStream({gt:'/Swarm ', lt:'/Swarm/', limit:1})
    .on('data', function (data) {  // the database is not empty
        var handshake = new Spec(data.key);
        if (self.db_id) {
            if (self.db_id!==handshake.id()) {
                self.close('wrong db');
            }
        } else {
            self.db_id = handshake.id();
        }
        if (self.ssn_id) {
            if (self.ssn_id!==handshake.source()) {
                self.close('wrong session');
            }
        } else {
            self.ssn_id = handshake.source();
        }
        /*var opts = JSON.parse(data.value); TODO
        for(var key in opts) {
            if (key in options) {
                console.warn('option overridden:', key);
            }
            options[key] = opts[key];
        }*/
    }).on('error', function (err) {
        self.close(err);
    }).on('end', function(){
        if (!self.db_id) {// the database is empty
            self.close('uninitialized db');
        } else {
            self.db.put(self.handshake());
        }
        self.clock = options.clock || new stamp.Clock (self.ssn_id);
        if (options.listen_url) {
            self.listen(options.listen_url);
        }
    });
};


Replica.prototype.loadTail = function (typeid, mark, callback) {
    var key_prefix = this.prefix + typeid;
    var gte_key = key_prefix + mark;
    var lt_key = key_prefix + typeid + '~';
    var error = null;
    var data = [];
    this.db.createReadStream({
        gte: gte_key, // start at the mark (inclusive)
        lt: lt_key // don't read the next object's ops
    }).on('data', function (data){
        var key = data.key.substr(key_prefix.length);
        data.push(new Op(key, data.value));
    }).on('error', function(err){
        console.error('data load failed', typeid, mark, error);
        error = err;
        // TODO EXIT stop all processing, exit
    }).on('end', function () {
        callback(error, data);
    });

};



//        N E T W O R K I N G        //


Replica.prototype.handshake = function () {
    if (!this.db_id || !this.ssn_id) {
        return null;
    }
    var handshake_spec = new Spec('/Swarm+Replica')
        .add(this.db_id, '#')
        // generate stream stamp
        .add(this.clock.issueTimestamp(), '!')
        .add('.on');
    return new Op(handshake_spec, ''); // TODO options
};

// Add a connection to other replica, either upstream or downstream.
Replica.prototype.addStream = function (stream) {
    var self = this;
    var op_stream = new OpStream (stream, undefined, {});

    function onStreamHandshake (op) {
        //var client_ssn_id = op.origin();
        var client_db_id = op.id();
        if (self.db_id && self.db_id!==client_db_id) {
            onHandshakeResult('wrong database id');
        //} else if (self.ssn_id && self.ssn_id!==client_ssn_id) {
        //    onHandshakeResult('wrong session id');
        } else if (self.options.authorize) {
            self.options.authorize ({
                stream: stream,
                op_stream: op_stream,
                handshake: op
            }, onHandshakeResult);
        } else {
            onHandshakeResult();
        }
    }

    function onError (msg) {
        try {
            op_stream.end(new Op('.error', msg||'handshake error'));
        } catch (ex) {}
    }

    function onHandshakeResult (error) {
        if (error) {
            op_stream.end(new Op('.error', error));
        } else {
            self.streams[op_stream.peer_stamp] = op_stream;
            op_stream.on('data', self.bound_write);
            op_stream.on('end', function () {
                self.removeStream(op_stream);
            });
        }
    }

    op_stream.on('id', onStreamHandshake);
    op_stream.on('error', onError);
    setTimeout(function kill(){
        if (!op_stream.ssn_id) {
            stream.close();
            op_stream.close();
        }
    }, 3000);

    op_stream.sendHandshake(self.handshake());
};


Replica.prototype.removeStream = function (op_stream) {
    if (op_stream.constructor===String) {
        op_stream = this.streams[op_stream];
    }
    if (!op_stream) { return; }
    var stamp = op_stream.peer_stamp;
    if (stamp in this.streams) {
        op_stream.removeAllListeners();
        delete this.streams[stamp];
        var off = new Spec('/Swarm').add(this.db_id, '#')
            .add(op_stream.stamp, '!').add('.off');
        op_stream.end(off);
    }
};

// TODO  separate networking into a file/class, leave Replica.addStream only
Replica.prototype.listen = function (url, options, on_ready) {
    var self=this;
    if (!self.db_id || !self.ssn_id) {
        throw new Error('not initialized yet');
    }
    if (url in self.servers) {
        throw new Error('I listen that url already');
    }
    if (options && options.constructor===Function) {
        on_ready = options;
        options = null;
    }

    stream_url.listen(url, options, function (err, server){
        if (err) {
            console.error('can not listen', err);
            on_ready && on_ready(err, null);
        } else {
            self.servers[url] = server;
            server.on('connection', self.addStream.bind(self));
            on_ready && on_ready(null, server);
        }
    });

};
