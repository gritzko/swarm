"use strict";
var stream_url = require('stream-url');
var levelup = require('level');
var stamp = require('swarm-stamp');
var AnchoredVV = stamp.AnchoredVV;
var LamportTimestamp = stamp.LamportTimestamp;

var sync     = require('swarm-syncable');
var Spec = sync.Spec;
var Op = sync.Op;
var OpStream = sync.OpStream;
var Entry  = require('./Entry');

// Swarm database node backed by an ordered op storage
// Has an object stream based interface.
// Consumes ops, emits ops that need to be delivered to their op.source.
// For the actual object subscription/ op propagation
// logic see Subscription.js.
// Provides general infrastructure: db access, network connections.
// Any actual replication logic is scoped to a replicated object (syncable)
// see Entry.js.
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
    //
    this.ssn_id = options.ssn_id || null;
    this.db_id = options.db_id || null;
    // TODO offline - ?
    this.upstream = options.upstream || 'swarm';
    this.upstream_ssn = null;
    this.upstream_stamp = null;
    //
    this.entries = {};
    this.entry_states = {};
    //
    this.servers = {};
    this.streams = {};
    //
    if (options.clock) {
        this.clock = options.clock;
    } else if (this.ssn_id) {
        this.clock = new stamp.Clock(this.ssn_id);
    } else { // wait db read
        this.clock = null;
    }
    // db related stuff
    this.prefix = options.prefix || '';
    this.bound_write = self.write.bind(self);
    this.db = null;
    db.get( '.on', function onDbRead (err, value) {
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
        db.put('.on', self.handshake());
        if (options.listen) {
            self.listen(options.listen, options, callback);
        } else {
            callback && callback();
        }
    });
}
module.exports = Replica;


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
Replica.prototype.write = function (op) {
    if (op.constructor!==Op) {
        throw new Error('consumes swarm-syncable Op objects only');
    }
    if (op.spec.pattern()!=='/#!.') { // TODO validate nested patterns
        this.send(op.error('invalid op'));
        this.removeStream(op.source);
        return;
    }
    var typeid = op.typeid();

    // TREE:   subscribe to the upstream
    // make .on pending
    var new_ops = op.name()==='on' && op.patch ? op.patch.slice() : [];
    new_ops.push(op);

    var entry = this.entries[typeid];
    if (entry===undefined) {
        entry = new Entry(this, typeid, this.entry_states[typeid], new_ops);
        this.entries[typeid] = entry;
    } else {
        entry.queueOps(new_ops);
    }
};


Replica.prototype.send = function (op) {
    var stream = this.streams[op.source];

    // TREE for all the subscribers and the upstream !!!

    if (stream) {
        stream.write(op);
    } else {
        console.warn('op sent nowhere', op);
    }
};


Replica.prototype.done = function (request) {
    var self = this;
    var save_queue = request.save_queue;
    var send_queue = request.send_queue;
    request.save_queue = [];
    request.send_queue = [];
    // first, save to db
    if (save_queue.length) {
        var batch = [];
        var key_prefix = this.prefix + request.typeid;
        save_queue.forEach(function(o){
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
            for(var i=0; i<send_queue.length; i++) {
                self.send(send_queue[i]);
            }
        }
    }

    // FIXME prevent concurrency

};


Replica.prototype.close = function (err, callback) {

    // TODO FINISH processing all ops,
    // don't accept any further ops
    var err_op = err ? new Op('.error', err) : null;

    var stamps = Object.keys(this.streams);
    var closing = 0;
    while (stamps.length) {
        var stream = this.streams[stamps.pop()];
        closing++;
        stream.pause();
        stream.end(err?err_op:undefined, function () {

            // FIXME some requests are still in progress
            // this.terminate_on_done
            // on error, still invoke done()!

            if (!--closing) {
                this.db.close(function () {
                    process.exit(err?1:0);
                });
                this.db = null;
            }

        });
    }

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

//   [mark, log_end) - we need to see the starting point
Replica.prototype.loadTail = function (activeEntry, mark) {
    var db_mark = mark ? '!'+mark : '.';
    var typeid = activeEntry.typeid;
    var key_prefix = this.prefix + typeid;
    var gte_key = key_prefix + db_mark;
    var lt_key = key_prefix + typeid + '~';
    var error = null;
    var ops = [];
    this.db.createReadStream({
        gte: gte_key, // start at the mark (inclusive)
        lt: lt_key // don't read the next object's ops
    }).on('data', function (data){
        var key = data.key.substr(key_prefix.length);
        // FIXME strip stack prefix
        ops.push(new Op(key, data.value));
    }).on('error', function(err){
        console.error('data load failed', typeid, mark, error);
        error = err;
        // TODO EXIT stop all processing, exit
    }).on('end', function () {
        activeEntry.mark = mark || '~';
        activeEntry.next();
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
        var default_stamp = op_stream.peer_stamp === self.upstream ?
            op_stream.stamp : op_stream.peer_stamp; // TODO less guessing
        op_stream.setContext(new Spec.Parsed({
            type:  '/Model',
            stamp: default_stamp,
            op:    'on'
        }));
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
            var lamp = new LamportTimestamp(op_stream.peer_stamp);
            if (lamp.author()===self.upstream) {
                self.upstream_ssn = lamp.toString();
                self.upstream_stamp = op_stream.stamp;
            }
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
    if (stamp===this.upstream_ssn) {
        this.upstream_ssn = null;
        this.upstream_stamp = null;
    }
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
