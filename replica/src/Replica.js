"use strict";
var stream_url = require('stream-url');
var levelup = require('level');
var stamp = require('swarm-stamp');
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
    if (callback) {
        options.callback = callback;
    }
    this.options = options = options || {};
    if (!options.db_id) {
        // there is an option that our storage
        throw new Error('no database specified');
    }
    if (options.ssn_id) {
        this.user_id = new LamportTimestamp(options.ssn_id).author();
    } else if (options.user_id) {
        this.user_id = options.user_id;
    } else {
        throw new Error('no user id specified');
    }
    if (!options.db) {
        var memdown = require('memdown');
        if (!memdown) { throw new Error('no memdown!'); }
        this.db = levelup(memdown);
    } else {
        this.db = options.db;
    }
    // these two are set once we have de-facto access to the session's cache db
    this.ssn_id = null;
    this.db_id = options.db_id;
    this.last_ds_ssn = -1;
    this.last_us_stamp = null;
    if (options.db_id && options.ssn_id) {
        this.createClock(options.ssn_id);
    } else { // read ssn_id from the db or get it from the upstream
        this.clock = null;
    }
    // TODO offline - ?
    this.upstream_url = options.upstream || null; // url
    this.upstream_ssn = null;
    this.upstream_stamp = null;
    //
    this.entries = Object.create(null);
    this.entry_states = Object.create(null);
    //
    this.servers = Object.create(null);
    this.streams = Object.create(null);
    // db related stuff
    this.prefix = options.prefix || '';
    // check the existing db; depending on the outcome,
    // we'll proceed with the network stuff
    this.db.get( '.on', this.loadDatabaseHandshake.bind(this) );
}
module.exports = Replica;


Replica.prototype.loadDatabaseHandshake = function (err, hs_str) {
    // FIXME upstream session id MUST be stored in the db
    // FIXME max child ssn id too
    if (err && err.name==='NotFoundError') {
        err = null;
    } else if (err) {
        return this.noClock('db error: '+err.name);
    }
    var options = this.options;
    if (hs_str) {
        var hs = new Op(hs_str);
        if (options.db_id !== hs.id()) {
            return this.noClock('wrong database');
        }
        if (options.ssn_id && options.ssn_id !== hs.origin()) {
            return this.noClock('wrong session');
        }
        if (options.user_id && options.user_id !== hs.author()) {
            return this.noClock('wrong user');
        }
        if (!this.clock) {
            this.createClock(hs.origin());
            this.clock.seeTimestamp(hs.stamp());
        }
        if (hs.patch) {
            var kv = Object.create(null);
            hs.patch.forEach(function(op){
                kv[op.spec] = op.value;
            });
            if (kv['.last_ds_ssn']) {
                this.last_ds_ssn = parseInt(kv['.last_ds_ssn']);
            }
            this.last_us_stamp;
        }
    } else { // fresh db
        this.last_ds_ssn = 0;
        this.last_us_stamp = '';
    }
    if (options.upstream) {
        stream_url.connect(options.upstream, {
            reconnect: true // TODO  reconnect: true
        }, this.addStreamUp.bind(this));
    } else if (!this.clock) {
        this.noClock('can not get ssn_id');
    }
};

// The end of initialization: replica creates its logical clocks.
// These clocks are not used for timestamping data events (ops), but
// only for connection/subscription pseudo-operations.
// Hosts initiate all the mutations and the data is timestamped with
// Host clocks. A Replica is fully reactive, initiates nothing.
Replica.prototype.createClock = function (ssn_id) {
    var options = this.options;
    this.ssn_id = ssn_id;
    this.clock = options.clock || new stamp.Clock(this.ssn_id);
    if (options.prefix===true) {
        this.prefix = '*'+this.db_id;
    }
    this.saveDatabaseHandshake();
    if (options.listen) {
        this.listen(options.listen, options, function (err) {
            options.callback && options.callback(err);
        });
    } else {
        options.callback && options.callback();
    }
};

// failed to initialize
Replica.prototype.noClock = function (reason) {
    console.error('failed to create clocks', reason);
    this.options.callback && this.options.callback(reason);
};


Replica.prototype.issueSsn = function () {
    if (this.last_ds_ssn<0) {
        throw new Error('not ready yet');
    }
    var seq = ++this.last_ds_ssn;
    var ssn_id = this.ssn_id + '~' + stamp.base64.int2base(seq, 1);
    this.saveDatabaseHandshake();
    return ssn_id;
};

// every time we save the current timestamp to ensure monotony
Replica.prototype.saveDatabaseHandshake = function () {
    var hs = this.handshake();
    hs.value = this.last_us_stamp;
    hs.patch = []; // TODO bad style: make handshake() ret a spec
    hs.patch.push(new Op('.last_ds_ssn', ''+this.last_ds_ssn));
    this.db.put('.on', hs.toString());
};

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
    if (entry) {
        entry.queueOps(new_ops);
    } else if (op.name()==='on') {
        var meta = this.entry_states[typeid];
        entry = new Entry(this, typeid, meta, new_ops);
        this.entries[typeid] = entry;
        if (meta===undefined) {
            this.loadMeta(entry);
        }
    } else {
        this.send(op.error('unknown object'));
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
        var seen = {};
        // remove rewrites (tip, avv, etc)
        for(var i=save_queue.length-1; i>=0; i--) {
            if (seen.hasOwnProperty(save_queue[i].key)) {
                save_queue[i] = null;
            } else {
                seen[save_queue[i].key] = true;
            }
        }
        save_queue = save_queue.filter(function(rec){return !!rec;});
        var key_prefix = this.prefix + request.typeid;
        save_queue.forEach(function(rec){
            rec.key = key_prefix + rec.key;
        });

        this.db.batch(save_queue, send_ops);
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

// replay all subscriptions to a newly connected upstream
Replica.prototype.upscribe = function () {
    var tis = Object.keys(this.entries);
    for(var i=0; i<tis.length; i++){
        var entry = this.entries[tis[i]];
        entry.queueOps([new Op('.on')]);
    }
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


Replica.prototype.loadMeta = function (activeEntry) {
    var self = this;
    var key = this.prefix + activeEntry.typeid + '.meta'; // BAD
    this.db.get(key, function (err, value){
        if (err && err.name!=='NotFoundError') {
            console.error('data load failed', key, err);
            self.close();
        } else {
            activeEntry.setMeta(new Entry.State(value));
        }
    });
};

//   [mark, log_end) - we need to see the starting point
Replica.prototype.loadTail = function (activeEntry, mark) {
    var db_mark = '!' + (mark||'~');
    var typeid = activeEntry.typeid;
    var prefix = this.prefix, key_prefix = prefix + typeid;
    var gte_key = key_prefix + db_mark;
    var lt_key = key_prefix + '!' + activeEntry.mark;
    var error = null;
    var recs = [];
    this.db.createReadStream({
        gte: gte_key, // start at the mark (inclusive)
        lt: lt_key // don't read the next object's ops
    }).on('data', function (data){
        data.key = data.key.substr(key_prefix.length);
        recs.push(data);
    }).on('error', function(err){
        console.error('data load failed', typeid, mark, error);
        error = err;
        // TODO EXIT stop all processing, exit
    }).on('end', function () {
        activeEntry.prependStoredRecords(recs);
        activeEntry.mark = mark;
        activeEntry.next();
    });

};



//        N E T W O R K I N G        //


Replica.prototype.handshake = function () {
    if (!this.db_id) { return null; }
    var stamp = this.clock ? this.clock.issueTimestamp() :
        (this.ssn_id||this.user_id||'0');
    var handshake_spec = new Spec('/Swarm+Replica')
        .add(this.db_id, '#')
        .add(stamp, '!')
        .add('.on');
    return new Op(handshake_spec, ''); // TODO options
};


Replica.prototype.addStreamUp = function (err, stream) {
    if (err) {
        console.warn('upsteram conn fail', err);
        return;
    }
    var op_stream = new OpStream (stream, undefined, {});
    op_stream.once('id', this.onUpstreamHandshake.bind(this));
    op_stream.sendHandshake(this.handshake());
};
// FIXME  Muxer accepts connections to stream ids

Replica.prototype.onUpstreamHandshake = function (hs_op, op_stream) {
    if (this.db_id) {
        if (this.db_id!==hs_op.id()) {
            return op_stream.close('wrong db id');
        }
    } else {
        this.db_id = hs_op.id();
    }
    if (!this.ssn_id) {
        if (!hs_op.value) {
            return op_stream.close('no ssn received');
        }
        var stamp = new LamportTimestamp(hs_op.value);
        this.createClock(stamp.source());
        // FIXME   op_stream stamps
    }
    // TODO at some point, we'll do log replay based on the hs_op.value
    this.streams[op_stream.peer_stamp] = op_stream;
    op_stream.on('data', this.write.bind(this));
    op_stream.on('end', this.removeStream.bind(this));
    // TODO (need a testcase for reconnections)
    this.upscribe();
};

// Add a connection to other replica, either upstream or downstream.
Replica.prototype.addStreamDown = function (stream) {
    var op_stream = new OpStream (stream, undefined, {
        authorize: this.options.authorize // needs the stream
    });

    op_stream.on('id', this.onDownstreamHandshake.bind(this));

    setTimeout(function kill(){
        if (!op_stream.ssn_id) {
            stream.close();
            op_stream.close();
        }
    }, 3000); // the stream has 3 sec to complete the handshake

    op_stream.on('error', function onError (msg) {
        try {
            op_stream.end(new Op('.error',msg||'handshake error'));
        } catch (ex) {}
    });

};


Replica.prototype.onDownstreamHandshake = function (op, op_stream){
    // op_stream.setContext();
    if (this.db_id!==op.id()) {
        return op_stream.close('wrong database id');
    }
    var lamp = new stamp.LamportTimestamp(op.stamp());
    var hs = this.handshake();
    if (lamp.time()==='0') { // the ds has no clocks
        if (lamp.author() && lamp.author()!==this.user_id) {
            return op_stream.close('wrong user id');
        }
        var new_ssn = this.user_id + '~' + this.issueSsn();
        hs.value = new_ssn;
        // FIXME op_stream.xxx = new_ssn;
        // once we assign the ssn, stream stamp is still 0, but ssn id changes
    }
    op_stream.sendHandshake(hs);

    this.streams[op_stream.peer_stamp] = op_stream;

    op_stream.on('data', this.write.bind(this));
    op_stream.on('end', this.removeStream.bind(this));
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
            server.on('connection', self.addStreamDown.bind(self));
            on_ready && on_ready(null, server);
        }
    });

};


// # Session numbers
// we remember upstream handshakes
// upstream handshake stash
//   .on  /Swarm#db!time+swarm.on user~ssn
// as we depend on the peer replica state and remember our pos...
//   /Swarm#db!user.on user~ssn
//   /Swarm#db!user~ssn.on user~ssn~sub
//
//   !user.on user~ssn
//   !user~ssn.on user~ssn~sub
//
// Where should we put clock offset?
// Upstream shard ring id? (can't connect to other ring?)
//
// Trunk connections (multi-db): server-to-server only, db is
// prepended to ops & storage. Multi-db *mode*.
