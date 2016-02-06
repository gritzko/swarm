"use strict";
var stream_url = require('stream-url');
var EventEmitter = require('eventemitter3');
var util         = require("util");

var Swarm = require('swarm-syncable');
var sync = Swarm;
var Lamp = Swarm.LamportTimestamp;
var LamportTimestamp = Lamp;
var Spec = sync.Spec;
var Op = sync.Op;
var StreamOpSource = sync.StreamOpSource;
var LevelOpSource = require('./LevelOpSource');

/**
 *  Replica is a "proper" Swarm replica that is backed by an op/state storage
 *  and can talk to its upstream and any number of downstream replicas
 *  (either Hosts or full Replicas, [the protocol]{@link OpSource} is the same).
 *  Replica handles all the pub/sub work.
 *
 *  The backing database is normally an ordered key-value storage, also
 *  with an OpSource interface {@link LevelOpSource}. There happens all the
 *  patch-related logic.
 *
 *  Options:
 *  * repl_id
 *  * user_id
 *  * db_id
 *  * connect
 *  * listen
 *  * callback
 *  * snapshot_slave
 *  * prefix
 *  * clock
 *
 *  @class
 */
function Replica (database, options, callback) {
    EventEmitter.call(this);
    if (database && database.constructor===Object) {
        callback = options;
        options = database;
        database = options.db;
    }
    this.options = options = options || {};
    // these two are set once we have de-facto access to the session's cache db
    this.options = Object.create(null);
    this.role = null;
    this.repl_id = null;
    this.db_id = options.db_id;
    this.user_id = null;
    this.shard_id = null;
    this.database_hs = null;
    this.clock = null;
    // callbacks
    if (callback) {
        this.on('ready', callback);
    }
    options.onReady && this.on('ready', options.onReady);
    options.onWritable && this.on('writable', options.onWritable);
    options.onFail && this.on('fail', options.onFail);
    // upstream
    this.upstream_url = options.upstream || null; // url
    this.upstream_source_id = null;
    // listen
    this.servers = Object.create(null);
    // connections
    this.streams = Object.create(null);
    this.subscriptions = Object.create(null);
    // policies
    //Replica.CONNECTION_POLICIES; TODO
    this.hs_policies = [];
    Replica.pushPolicies(
        this.hs_policies,
        options.HandshakePolicies || 'SeqReplicaIdPolicy',
        Replica.HS_POLICIES
    );
    this.op_policies = [];
    Replica.pushPolicies(
        this.op_policies,
        options.OpPolicies || 'SubtreeOriginAccessPolicy',
        Replica.OP_POLICIES
    );
    // snapshot slave
    this.snapshot_slave = null;
    this.canned = Object.create(null); // TODO proper test with an async slave
    // misc
    this.su_handle = null; // ?
    this.close_cb = null;
    // home host
    this.home_host = null;
    // storage op sources
    this.ldb = database;
    this.dbos = new LevelOpSource (database, {
        onceHandshake: this.onDatabaseHandshake.bind(this),
        onOp:        this.onDatabaseOp.bind(this),
        onEnd:       this.onDatabaseEnd.bind(this)
    });
}
util.inherits(Replica, EventEmitter);
module.exports = Replica;
/** TODO Log all the logical Replica events/decisions (not msg trace!) */
Replica.debug = false;

/** a library of known handshake policies */
Replica.HS_POLICIES = Object.create(null);
/** a library of known per-op policies */
Replica.OP_POLICIES = Object.create(null);

Replica.pushPolicies = function (to, which, from) {
    if (!which)  { return; }
    var hsp = which.split(',');
    while (hsp.length) {
        var pname = hsp.shift();
        var policy = from[pname];
        if (policy) {
            to.push(policy);
        } else {
            throw new Error('policy unknown: '+pname);
        }
    }
};

require('./Policies');

/**************** F O R K I N G  &  O P T I O N S *****************/

Replica.options = require('./options.js');


/**  */
Replica.prototype.bareHandshake = function () {
    var myrole = this.role ? '/'+this.role+'+Swarm' : '/Swarm';
    var stamp = this.clock ? this.clock.issueTimestamp() : '0';
    var handshake_spec = new Spec(myrole)
        .add(this.db_id, '#')
        .add(stamp, '!')
        .add('.on');
    /*var role = new Lamp(incoming_hs.spec.type()); // TODO stacked
    var send_opts = Replica.options.filter(function(decl){
        return (decl.name in opts) && (decl.relay.indexOf(role)!==-1);
    });
    var patch = send_opts.map(function (o) {
        return new Op('.'+o.name, opts[o.name]);
    });*/
    return [handshake_spec, '', null]; // TODO options
};

Replica.prototype.saveHandshake = function () {
    var opts = this.options;
    var bare = this.bareHandshake();
    var ok = Object.keys(opts);
    var patch = ok.map(function(k){
        return new Op('!0.'+k, opts[k]);
    });
    var hs_op = new Op(bare[0], bare[1], null, patch);
    console.error('SAVE HS', hs_op.toString());
    // handshake refresh is an op
    this.dbos.writeHandshake(hs_op);
};


// The end of initialization: replica creates its logical clocks.
// These clocks are not used for timestamping data events (ops), but
// only for connection/subscription pseudo-operations.
// Hosts initiate all the mutations and the data is timestamped with
// Host clocks. A Replica is fully reactive, initiates nothing.
/**
 *
 */
Replica.prototype.createClock = function (stamp) {
    Replica.debug && console.warn('CREATE_CLOCK', stamp);
    var lamp = new Lamp(stamp);
    this.repl_id = lamp.origin();
    this.user_id = lamp.author(); // FIXME deprecated; move to a policy
    // options...
    var clock_opts = Object.create(null), opts = this.options;
    var ck = Object.keys(opts).filter(function(k){
        return /Clock([A-Z][a-z0-9]*)*/.test(k);
    });
    ck.forEach(function(k){
        clock_opts[k] = opts[k];
    });
    var clock_class = opts.Clock;
    if (!clock_class) {
        this.clock = new Swarm.Clock(stamp, clock_opts);
    } else {
        if (!/([A-Z][a-z0-9]*)*Clock/.test(clock_class)) {
            throw new Error('invalid clock class');
        }
        if (!Swarm.hasOwnProperty(clock_class)) {
            throw new Error('clock class unknown');
        }
        this.clock = new Swarm[clock_class](stamp, clock_opts);
    }
    this.saveHandshake();
    if (this.options.HomeHost) {
        this.createHomeHost();
    }
    if (this.options.SnapshotSlave) {
        this.createSnapshotSlave();
    }
    Replica.debug && console.error('WRITABLE');
    this.emit('writable');
};

/** failed to initialize */
Replica.prototype.noClock = function (reason) {
    //console.error('failed to create clocks', reason);
    this.emit('fail', reason);
};

Replica.prototype.createSnapshotSlave = function () {
    var SnapshotSlave = require('./SnapshotSlave');
    this.snapshot_slave = new SnapshotSlave(this.options); //TODO filter
    this.snapshot_slave.on('op', this.onSnaphotSlaveOp.bind(this));
};

Replica.prototype.createHomeHost = function () {
    Replica.debug && console.error('CREATE_HOST');
    this.home_host = new Swarm.Host({
        repl_id: this.repl_id,
        user_id:this.user_id,
        db_id:  this.db_id,
        clock:  this.clock,
        onceHandshake: this.onDownstreamHandshake.bind(this)
    });
};

/*********************** D B  E V E N T S *************************/

/**
 *  Every run starts with a database handshake read.
 *  That way we read in all the settings.
 */
Replica.prototype.onDatabaseHandshake = function (hs) {
    var opts = this.options;
    this.database_hs = hs;
    // read in the spec
    var type = Lamp.tuple(hs.spec.type());
    if (type[2]!=='Swarm') {
        throw new Error('invalid handshake');
    }
    this.role = type[1] || 'Root';
    var id = Lamp.tuple(hs.spec.id());
    this.db_id = id[2];
    this.shard_id = id[1] || null;
    // TODO Role
    // read in the options
    hs.patch.forEach(function(o){
        if (!opts[o.name()]) {
            opts[o.name()] = o.value;
        }
    });
    this.emit('ready', hs);
    // create clock
    this.createClock(hs.stamp());
    // connect to the upstream
    if (opts.Connect) {
        this.connect();
    } else if (!this.clock) {
        this.noClock('can not get repl_id');
    }
    // listen for downstream conns
    if (opts.listen) {
        this.listen(opts.listen, {}, function (err) {
            this.emit('listen', err);
        });
    }

};

Replica.prototype.onDatabaseHsAck = function (ack) {
    Replica.debug && console.warn('HS_ACK', ack.toString());
    if (ack.name()==='on') {

    } else if (ack.name()==='off') {
        var source_id = ack.stamp();
        var source = this.streams[source_id];
        if (source) {
            delete this.streams[source_id];
            source.writeEnd(ack);
        }
    }
};

Replica.prototype.onDatabaseOp = function (op) {
    Replica.debug && console.warn('DB_OP', op.toString());
    if (op.spec.Type().origin()==='Swarm') {
        return this.onDatabaseHsAck(op);
    } else if (op.name()==='on' || op.name()==='off') { // re/un/up scription
        this.onDatabaseOnOff(op);
    } else { // regular op
        this.onDatabaseNewOp(op);
    }
};


Replica.prototype.onDatabaseNewOp = function (op) {
    this.clock.seeStamp(op.stamp());
    var sub = this.subscriptions[op.typeid()];
    if (!sub) {
        Replica.debug && console.warn('OP_NOWHERE', op.toString());
        return;
    }
    for(var i=0; i<sub.length; i++) {
        if (sub[i].charAt(0)==='!') {
            var can_key = op.typeid()+sub[i];
            this.canned[can_key].push(op);
        } else {
            var op_stream = this.streams[sub[i]];
            if (op_stream) {
                op_stream.writeOp(op);
            } else {
                sub.splice(i--,1);
            }
        }
    }
};


Replica.prototype.onDatabaseOnOff = function (op) {
    var typeid = op.typeid();
    var source = op.stamp(); // true for .ons and .offs
    var op_stream = this.streams[source];
    if (!op_stream) {
        return Replica.debug && console.warn('ON_NOWHERE', op.toString());
    }
    var sub = this.subscriptions[typeid];
    if (!sub) {
        sub = this.subscriptions[typeid] = [];
    }
    if (op.name()==='on') {
        var snapshot = this.snapshot_slave && op.patch &&
            op.patch.length>1 && op.patch[0].name()==='~state';
        if (snapshot) {
            var can_key = op.typeid()+'!'+op.stamp();
            Replica.debug && console.warn('CAN', can_key);
            this.canned[can_key] = []; // FIXME two .ons?! kill one!
            if (sub.indexOf('!'+source)===-1) {
                sub.push('!'+source);
            }
            this.snapshot_slave.writeOp(op);
        } else {
            if (sub.indexOf(source)===-1) {
                sub.push(source);
            }
            op_stream.writeOp(op);
        }
    } else {
        op_stream.writeOp(op);
        if (sub) {
            var ind = sub.indexOf(source);
            ind!==-1 && sub.splice(ind,1);
            if (!sub.length) {
                delete this.subscriptions[typeid];
            }
        }
    }
};


Replica.prototype.onDatabaseEnd = function (off) {
    if (this.close_cb) {
        this.close_cb(off.value);
    }
};

// every time we save the current timestamp to ensure monotony

/*

announce : { downstream: ["Clock"], overload: [] }
Only accepted from cli, db, upstream. Upstream opts are saved. Cli opts are saved. Upstream overrides, hooks see both, can edit. Same for downstream connections, hooks can see.
Strings: registered callbacks. Replica.option_hooks, downstream_hooks, upstream_hooks, connection_hooks, storage_hooks.

Replica. debug : logical replica events, not in out

*/

Replica.prototype.connect = function (url) {
    if (this.su_handle) {
        throw new Error('uplink connection is already on');
    }
    url = url || this.options.connect;
    this.su_handle = stream_url.connect(this.options.connect, {
        reconnect: true
    }, this.addStreamUp.bind(this));
};


// Grants a session number to a newly connected client.
// A root session may grant session numbers to arbitrary clients,
// while a local proxy can only assign recursive session ids to same-user
// sessions. An on-premises proxy acts transparently in this regard by
// forwarding db handshakes to/from the upstream thus assigning no ids.
Replica.prototype.issueDownstreamSessionId = function () {
    if (this.last_ds_ssn<0) {
        throw new Error('not ready yet');
    }
    var seq = ++this.last_ds_ssn;
    var repl_id = this.repl_id + '~' + Swarm.base64.int2base(seq, 1);
    this.saveDatabaseHandshake();
    return repl_id;
};


/******************** O P E R A T I O N S *************************/


// process an incoming op
Replica.prototype.onStreamOp = function (op, op_stream) {
    Replica.debug && console.warn('OP', op.toString());
    if (op.constructor!==Op) {
        throw new Error('consumes swarm-syncable Op objects only');
    }
    if (!this.streams[op.source]) {
        console.warn('op origin unknown', op.source, Object.keys(this.streams));
    }
    var plc = this.op_policies, pi = 0;
    var self = this;
    if (plc.length) {
        next_policy();
    } else {
        accept();
    }
    function next_policy (err) {
        if (err) {
            reject(err);
        } else if (pi<plc.length)  {
            Replica.debug && console.warn('POLICY', plc[pi].name);
            try {
                plc[pi++].call(self, op, op_stream, next_policy);
            } catch (ex) {
                reject(ex.message);
            }
        } else {
            accept();
        }
    }
    function accept () {
        Replica.debug && console.warn('ACCEPT');
        self.dbos.writeOp(op);
    }
    function reject (err) {
        Replica.debug && console.warn('REJECT', err, op.toString());
        var err_spec = op.spec.set('.error');
        op_stream.writeOp(new Op(err_spec, err, self.repl_id));
    }
};

/*   TODO per-op access checks
    if (op.source!==upstream && !Spec.inSubtree(origin, src_lamp.source())) {
        this.send(op.error('invalid op origin'));
        this.next();  // FIXME quite ugly and error-prone
        return;
    }
*/


Replica.prototype.send = function (op) {
    var stream = this.streams[op.source];
    if (!stream) {
        console.warn('op sent nowhere', op);
        return;
    }
    // TEMP workaround for snapshotting FIXME
    // this code is not OK in the general case
    // temporarily acceptable until Replica+Entity are
    // refactored
    var typeid = op.typeid();
    var job = this.snapshot_jobs[typeid];
    if (this.snapshot_slave && op.name()==='on' && op.patch &&
        op.patch.length>1 && op.patch[0].name()==='~state') { // snapshot it
        if (!job) {
            job = this.snapshot_jobs[typeid] = {
                stamp: op.patch[op.patch.length-1].stamp(),
                streams: [op.source]
            };
            this.snapshot_slave.write(op);
        } else {
            job.streams.push(op.source);
        }
    } else if (job && job.streams.indexOf(op.source)!==-1) {
        if (job.stamp!==op.stamp()) {
            job.stamp = op.stamp();
            this.snapshot_slave.write(op);
        }
    } else {
        Replica.debug && console.log('<='+this.repl_id+'\t'+op.toString());
        stream.write(op);
    }
};


Replica.prototype.onSnaphotSlaveOp = function (op) {
    if (op.name()!=='on') {
        throw new Error('misrouted op');
    }
    var stamp = op.stamp();
    var source = this.streams[stamp];
    Replica.debug && console.warn('SNAPSHOT', op.spec.toString());
    if (source) {
        source.writeOp(op);
    }
    var can_key = op.typeid()+'!'+stamp;
    var can = this.canned[can_key];
    if (can) {
        Replica.debug && console.warn('UNCAN', can.length);
        if (source) {
            for (var i=0; i<can.length; i++) {
                source.writeOp(can[i]);
            }
        }
        var subs = this.subscriptions[op.typeid()];
        var j = subs.indexOf('!'+op.stamp());
        subs[j] = op.stamp();
        Replica.debug && console.warn('UNCAN', can.length, can_key, subs, j);
        delete this.canned[can_key];
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
            if (!rec.value) {
                rec.value = ' ';
            }
        });
        Replica.trace && console.log('SAVE', save_queue);

        this.db.batch(save_queue, send_ops);
    } else {
        send_ops();
    }
    // second, send responses
    function send_ops (err) {
        if (err) {
            console.error('db write fail', err);
            // must not send anything but an error
            // an acknowledgement for a non-saved op will ruin sync
            self.send(request.op.error('db write error'));
            // TODO FIXME EXIT stop everything, terminate the process
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
    var typeids = Object.keys(this.entries);
    for(var i=0; i<typeids.length; i++){
        var typeid = typeids[i];
        var entry = this.entries[typeid];
        // FIXME WRONG -- need a real upscribe
        entry.queueOps([new Op(typeid + '.on', null)]);
    }
};


Replica.prototype.close = function (err, callback) {
    if (err && err.constructor===Function) {
        callback = err;
        err = '';
    }
    this.close_cb = callback;

    Replica.trace && console.log('CLOSE', err);
    // TODO FINISH processing all ops,
    // don't accept any further ops
    var self = this;

    Object.keys(this.servers).forEach(function(url){
        self.servers[url].close();
    });

    Object.keys(this.streams).forEach(function(src_id){
        var src = this.streams[src_id];
        src.removeAllListeners();
        self.dbos.writeOp(new Op(src.hs.set('.off'), 'exiting'));
    });

    this.saveHandshake();

    self.dbos.writeEnd(new Op(this.dbos.hs.spec.set('.off'), ''));

};


//        D A T A B A S E        //


Replica.prototype.loadMeta = function (activeEntry) {
    var self = this;
    var key = this.prefix + activeEntry.typeid + '.meta'; // BAD
    this.db.get(key, function (err, value){
        if (err && !isNFE(err)) {
            console.error('data load failed', key, err);
            self.close();
        } else {
            Replica.trace && console.log('META', key, value);
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
        data.key = data.key.substr(prefix.length);
        if (data.value===' ') { data.value = ''; }
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


/********************** C O N N E C T I O N S *********************/


// FIXME ensure our handshake gets into the 1st TCP packet
Replica.prototype.addStreamUp = function (err, stream) {
    if (err) {
        console.warn('upsteram conn fail', err);
        return;
    }
    var op_stream = new StreamOpSource (stream);
    this.setUpstreamSource(op_stream);
};
// FIXME  Muxer accepts connections to stream ids

Replica.prototype.setUpstreamSource = function (op_source) {
    op_source.once('handshake', this.onUpstreamHandshake.bind(this));
    op_source.writeHandshake(this.handshake());
};

Replica.prototype.onUpstreamHandshake = function (hs_op, op_stream) {
    var self = this;
    if (this.db_id && this.db_id!==hs_op.id()) {
        return op_stream.end('wrong db id');
    }
    this.db_id = hs_op.id();
    if (this.repl_id) {
        if (this.repl_id!==hs_op.origin()) {
            return op_stream.end('wrong replica id?!');
        }
        if (stamp<this.last_stamp && this.clock.isTooIncorrect(hs_op.stamp())) {
            // we've got a problem; let clock decide
            console.warn('dangerous clock de-sync');
            this.createClock(hs_op.stamp());
            this.clock.seeTimestamp(this.last_stamp);
        }
        if (mytime.ms>utime.ms+1000 || mytime.ms<utime.ms-5000) {
            // kill yourself loser
            // actually, re-create the clock and prey we
            // don't have timestamps in the future
            this.last_stamp; // use this
        }
    } else {
        this.repl_id = hs_op.origin();
        this.createClock(hs_op.stamp());
    }
    // TODO at some point, we'll do log replay based on the hs_op.value
    var hs_op_ssn = hs_op.origin();
    var hs_op_stamp = hs_op.stamp();

    this.streams[hs_op_stamp] = op_stream;
    this.upstream_ssn = hs_op_ssn;
    this.upstream_stamp = hs_op_stamp;

    op_stream.on('op', this.write.bind(this));
    op_stream.on('end', function () {
        self.removeStream(hs_op_stamp);
    });
    Replica.debug && console.log('U>>'+this.repl_id+'\t'+hs_op);
    // TODO (need a testcase for reconnections)
    this.upscribe();

    this.emit('connection', {
        op_stream: op_stream,
        upstream: true,
        repl_id: hs_op_ssn,
        stamp:  hs_op_stamp,
    });
};

// Add a connection to other replica, either upstream or downstream.
Replica.prototype.addStreamDown = function (stream) {
    if (!this.repl_id) {
        return stream.end('.error\replica is not initialized yet\n');
    }
    var op_stream = new StreamOpSource (stream);
    this.addDownstreamSource(op_stream);
};

Replica.prototype.addDownstreamSource = function (op_stream) {
    var self = this;
    if (!self.repl_id) {
        throw new Error('not initialized yet!');
    }
    function on_pre_hs_fail (err) {
        op_stream.removeListener('handshake', on_hs);
        op_stream.writeEnd(err);
    }
    function on_hs(op) {
        op_stream.removeListener('end', on_pre_hs_fail);
        self.onDownstreamHandshake(op, op_stream);
    }
    op_stream.once('end', on_pre_hs_fail);
    op_stream.once('handshake', on_hs);

    setTimeout(function kill(){
        if (!op_stream.peer_hs) {
            op_stream.writeEnd('no handshake');
            op_stream.removeAllListeners();
        }
    }, Replica.HS_WAIT_TIME); // the stream has some time to complete the handshake

};
Replica.HS_WAIT_TIME = 3000;


/**
 * ssn id assignment necessitates strict handshake sequence:
 * the client introduces itself first. That matches the logic
 * of the spanning tree quite nicely. P2P shortcut links can
 * still behave the way they want.
 */
Replica.prototype.onDownstreamHandshake = function (hs, op_stream){
    var self = this;
    Replica.debug && console.warn('DOWNSTREAM_HS', hs.toString());
    var re_hs = [hs.spec, '', []];
    var plc = this.hs_policies, pi = 0;
    if (this.db_id!==hs.id() && hs.id()!=='0') {
        re_hs[0] = re_hs[0].set('.off');
        re_hs[1] = 'wrong database id';
        reject ();
    } else {
        next_policy();
    }
    function next_policy () {
        if (pi<plc.length && re_hs[0].name()==='on')  {
            plc[pi++].call(self, hs, re_hs, op_stream, next_policy);
        } else {
            done();
        }
    }
    function done () {
        var stamp = self.clock.issueTimestamp({precise: true});
        var re_stamp = new Lamp(stamp.time(), re_hs[0].origin());
        re_hs[0] = re_hs[0].set(re_stamp, '!');
        var re_hs_op = Op.create(re_hs, self.repl_id);
        re_hs[0].name()==='on' ? accept(re_hs_op) : reject(re_hs_op);
    }
    function accept (re) {
        Replica.debug && console.warn('HS_ACCEPT',re.toString());
        op_stream.writeHandshake(re);
        self.dbos.writeOp(hs);
        op_stream.on('op', self.onStreamOp.bind(self));
        op_stream.on('end', self.onStreamEnd.bind(self));
        self.streams[re.stamp()] = op_stream;
        self.emit('connection', {
            op_stream: op_stream,
            upstream: false,
            repl_id: re.origin()
        });
    }
    function reject (re) {
        Replica.debug && console.warn('HS_REJECT',re.toString());
        op_stream.writeEnd(re);
    }
};


/**
 *  A simple default replica id assignment policy.
 *  Assumes the user id is provided in the incoming handshake.
 *  Otherwise, uses 'anon'. Employs simple sequential numbering
 *  for all the sessions, but also adds the user id (gritzko~1k2).
 */
Replica.prototype.replica_id_policy =  function (hs, opts, op_stream, callback) {
    var seq = ++this.last_ds_ssn;
    var lamp = new LamportTimestamp(hs.stamp());
    'anon';
    var parent = this.user_id==='swarm' ? lamp.author() : this.repl_id;
    var new_ssn = parent + '~' + Swarm.base64.int2base(seq, 1);
    callback(null, new_ssn);
};


// the default agree-to-everything cumulative-numbering ssn assignment policy
// Replica.seq_ssn_policy =  function (op, op_stream, callback) {
//     var replica = this;
//     var lamp = new Swarm.LamportTimestamp(op.stamp());
//     if (replica.user_id!=='swarm' && lamp.author() && lamp.author()!==replica.user_id) {
//         callback('wrong user');
//         return;
//     }
//     //var ds_user_id = lamp.author();
//     var seq = ++replica.last_ds_ssn;
//     var parent = replica.user_id==='swarm' ? lamp.author() : replica.repl_id;
//     var new_ssn = parent + '~' + Swarm.base64.int2base(seq, 1);
//     // FIXME recursive
//     replica.saveDatabaseHandshake(); // FIXME callback (prevent double-grant on restart)
//     callback(null, new_ssn);
//     // FIXME op_stream.xxx = new_ssn;
//     // once we assign the ssn, stream stamp is still 0, but ssn id changes
// };

/**
 * We expect that we always receive 'end' and that we receive it once.
 */
Replica.prototype.onStreamEnd = function (off, op_stream) {
    // we trust the .off op as it is made by OpSource.js
    Replica.debug && console.warn('DOWNSTREAM_END', op_stream.source());
    var source_id = op_stream.source_id;
    if (this.streams[source_id]!==op_stream) {
        throw new Error('no such source to remove');
    }
    if (source_id === this.upstream_source_id) {
        this.upstream_source_id = null;
    }

    this.emit('disconnect', {
        hs: off,
        source_id: source_id,
        source: op_stream
    });

    op_stream.removeAllListeners('op'); // I'm the owner
    op_stream.removeAllListeners('end');

    if (off.value || !this.dbos) { // there is some error
        delete this.streams[source_id];
        var my_off = op_stream.hs.spec.set('.off');
        op_stream.writeEnd(new Op(my_off, 're:'+off.value));
    } else { // let's finish things
        // some incoming ops may still be queued, so let's
        // wait for the response and finalize politely
        this.dbos.writeOp(off);
    }

};

// TODO  separate networking into a file/class, leave Replica.addStream only
Replica.prototype.listen = function (url, options, on_ready) {
    var self=this;
    if (!self.db_id || !self.repl_id) {
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

/********************** M A I N T E N A N C E *********************/

Replica.prototype.stats = function () {
    var stats = {
        repl_id: this.repl_id,
        db_id:  this.db_id,
        time:   this.clock.issueTimestamp(),
        activeStreamsDown: Object.keys(this.streams).length
    };
    return stats;
};

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

function isNFE (err) {
    return err.notFound || err.message==='NotFound' || err.name==='NotFoundError';
}
