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
 *  Handshake   such as role   see protocol  can not be set at will
 *
 *  Option conventions: stored are UpperCase, transient are lower_case
 *  Options:
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
    // listen
    this.servers = Object.create(null);
    // outer op sources
    this.upstream = null;
    this.streams = Object.create(null);
    this.pre_streams = Object.create(null);
    this.subscriptions = Object.create(null);
    // objects that have to be synced to the upstream
    this.unsynced = Object.create(null);
    this.unsynced_count = 0;
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
Replica.ROLES = {Shard:1,Ring:1,Slave:1,Switch:1,Client:1};
Replica.RELAY_OPTIONS = {Clock:1};

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
    bare[2] = Object.keys(opts).filter(function(k){
        return k.match(/^[A-Z]\w+$/);
    }).map(function(k){
        return ['!0.'+k, opts[k]]; // TODO timestamp 'em
    });
    var hs_op = Op.create(bare);
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
    if (this.clock) {
        throw new Error('clock is created already');
    }
    if (lamp.toString()==='0') {
        throw new Error('can not init clock with a zero');
    }
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
    if (this.options.HomeHost || this.options.home_host) {
        this.createHomeHost();
    }
    if (this.options.SnapshotSlave) {
        this.createSnapshotSlave();
    }
    Replica.debug && console.error('WRITABLE', stamp.toString());
    this.emit('writable'); // ?
    this.emit('ready', stamp);
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
    Replica.debug && console.warn('ON_DB_HS', hs.toString());
    var opts = this.options;
    this.database_hs = hs;
    // read in the spec
    var type = Lamp.tuple(hs.spec.type());
    if (type[2]!=='Swarm') {
        return this.noClock('invalid db handshake');
    }
    this.role = type[1] || '';
    var id = Lamp.tuple(hs.spec.id());
    this.db_id = id[2];
    this.shard_id = id[1] || null;
    // TODO Role
    // read in the options
    hs.patch && hs.patch.forEach(function(o){
        if (!opts[o.name()]) {
            opts[o.name()] = o.value;
        }
    });
    // create clock
    if (hs.stamp()!=='0') {
        this.createClock(hs.stamp());
    } else if (opts.Connect) { // connect to the upstream
        this.connect();
    } else if (opts.upstream) { // ready-made upstream opsource
        this.setUpstreamSource(opts.upstream);
    } else {
        return this.noClock('can not get repl_id');
    }
    // listen for downstream conns
    if (opts.listen) {
        this.listen(opts.listen, {}, function (err) {
            this.emit('listen', err);
        });
    }

};

Replica.prototype.onDatabaseHsAck = function (ack) {
    Replica.debug && console.warn('ON_DB_HS_ACK', ack.toString());
    if (ack.name()==='on') {

    } else if (ack.name()==='off') {
        var source_id = ack.stamp();
        var source = this.streams[source_id];
        if (source) {
            delete this.streams[source_id];
            source.writeEnd(ack);
            this.emit('disconnect', {
                hs: ack,
                source_id: source_id,
                source: source
            });
        }
    }
};

Replica.prototype.onDatabaseOp = function (op) {
    Replica.debug && console.warn('ON_DB_OP', op.toString());
    if (op.spec.Type().origin()==='Swarm') {
        return this.onDatabaseHsAck(op);
    } else if (op.name()==='on' || op.name()==='off') { // re/un/up scription
        if (op.stamp()==='0') {
            this.onDatabaseUpscribe(op);
        } else {
            this.onDatabaseOnOff(op);
        }
    } else { // regular op
        this.onDatabaseNewOp(op);
    }
};


Replica.prototype.onDatabaseNewOp = function (op) {
    this.clock.seeTimestamp(op.stamp());
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


Replica.prototype.onDatabaseUpscribe = function (op) {
    if (!this.upstream) {
        console.warn('NO_UPSTREAM', op.spec.toString());
        return;
    }
    var typeid = op.typeid();
    var spec = typeid + '!' + this.upstream.source_id + '.on';
    var stamped = Op.create([spec, op.value, op.patch]);
    this.upstream.writeOp(stamped);
    if (this.unsynced[typeid]!==this.upstream.source_id) {
        if (!this.unsynced[typeid]) {
            this.unsynced_count++;
        }
        this.unsynced[typeid] = this.upstream.source_id;
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
        throw new Error('upstream connection is already on');
    }
    url = url || this.options.connect;
    this.su_handle = stream_url.connect(this.options.connect, {
        reconnect: {
          minDelay: 1000,
          maxDelay: 30000,
        },
    }, this.addStreamUp.bind(this));
};


Replica.prototype.disconnect = function (url) {
    if (!url) {
        if (this.upstream) {
            this.upstream.writeEnd('');
        } else {
            Replica.debug && console.warn('no upstream anyway');
console.warn(new Error('why so').stack);
        }
    } else {

    }
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


Replica.prototype.onUpstreamOp = function (op, op_stream) {
    Replica.debug && console.warn('ON_UP_OP', op.toString());
    if (op.name()==='error') {
        Replica.debug && console.warn('UP_ERROR', op.toString());
        return;
    }
    this.dbos.writeOp(op);
    if (op.name()==='on' && this.unsynced[op.typeid()]) { // re .on
        delete this.unsynced[op.typeid()];
        this.unsynced_count--;
        if (!this.unsynced_count) {
            this.emit('synced');
        }
    }
};


// process an incoming op
Replica.prototype.onDownstreamOp = function (op, op_stream) {
    Replica.debug && console.warn('ON_DS_OP', op.toString());
    if (!this.streams[op.source]) {
        console.warn('op origin unknown', op.source, Object.keys(this.streams));
        return;
    }
    if (op.name()==='error') {
        Replica.debug && console.warn('DS_ERROR', op.toString());
        return;
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
        Replica.debug && console.warn('ACCEPT', op.spec.toString());
        self.dbos.writeOp(op);
    }
    function reject (err) {
        Replica.debug && console.warn('REJECT', err, op.toString());
        var err_spec = op.spec.set('.error');
        op_stream.writeOp(new Op(err_spec, err, self.repl_id));
    }
};



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
        Replica.debug && console.warn('<='+this.repl_id+'\t'+op.toString());
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
        delete this.canned[can_key];
    }
};


/**
 * forward all active subscriptions to the newly connected upstream
 */
Replica.prototype.upscribe = function () {
    var typeids = Object.keys(this.subscriptions);
    var dbos = this.dbos;
    typeids.forEach(function(typeid){
        dbos.writeOp(new Op(typeid+'!0.on', ''));
    });
};

/**
 * upscribe either all the changed objects or all those locally cached
 * @param mode, 'all' || 'changed'
 */
Replica.prototype.sync = function (mode, done) {
    // TODO issues: upstream disappears while we make the list
    var typeids = [];
    this.dbos.scanMeta(function(err, typeid, meta){
        Replica.debug && console.warn('META', typeid, meta&&meta.toString());
        if (err) {
            return done && done(err);
        } else if (meta) {
            if (mode==='all' || meta.isChanged()) {
                typeids.push(typeid);
            }
        } else {
            send_upscribes();
        }
    });
    var self = this;
    function send_upscribes () {
        typeids.forEach(function(typeid){
            if (typeid in self.subscriptions) {return;}
            self.markUnsynced(typeid);
            self.dbos.writeOp(new Op(typeid+'!0.on', ''));
        });
        done && done();
    }
};


Replica.prototype.markUnsynced = function (typeid) {
    if (this.unsynced[typeid]) { return; }
    this.unsynced[typeid] = this.upstream.source_id || '0';
    this.unsynced_count++;
};

/** close: terminate connections, close the db, invoke the callback */
Replica.prototype.close = function (err, callback) {
    if (err && err.constructor===Function) {
        callback = err;
        err = '';
    }
    this.close_cb = callback;

    Replica.debug && console.warn('CLOSE', err);
    // TODO FINISH processing all ops,
    // don't accept any further ops
    var self = this;

    Object.keys(this.servers).forEach(function(url){
        try {
            self.servers[url].close();
        } catch (ex) {
            console.warn('a server fails to close', url, ex.message);
        }
    });

    Object.keys(this.streams).forEach(function(src_id){
        var src = self.streams[src_id];
        src.removeAllListeners();
        self.dbos.writeOp(new Op(src.hs.spec.set('.off'), 'exiting'));
    });

    this.saveHandshake();

    self.dbos.writeEnd(new Op(this.dbos.hs.spec.set('.off'), ''));

};



/********************** C O N N E C T I O N S *********************/


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
    Replica.debug && console.warn('UP_HS_OUT');
    op_source.once('handshake', this.onUpstreamHandshake.bind(this));
    op_source.writeHandshake(Op.create(this.bareHandshake()));
};

Replica.prototype.onUpstreamHandshake = function (hs_op, op_stream) {
    Replica.debug && console.warn('UP_HS_IN', hs_op.toString());
    var self = this;
    if (this.db_id==='0') {
        this.db_id = hs_op.id();
    } else if (this.db_id && this.db_id!==hs_op.id()) {
        return op_stream.end('wrong db id');
    }
    this.db_id = hs_op.id();
    if (this.clock) {
        if (this.repl_id!==hs_op.origin()) {
            return op_stream.end('wrong replica id?!');
        }
        this.clock.seeTimestamp(hs_op.stamp(), 1|2); // FIXME flags
    } else {
        this.repl_id = hs_op.origin();
        hs_op.patch && hs_op.patch.forEach(function(pop){
            self.options[pop.name()] = pop.value; // FIXME run time
        });
        this.createClock(hs_op.stamp());
    }
    // TODO at some point, we'll do log replay based on the hs_op.value
    var hs_op_ssn = hs_op.origin();
    var hs_op_stamp = hs_op.stamp();

    this.streams[hs_op_stamp] = op_stream;
    this.upstream = op_stream;
    this.upstream_ssn = hs_op_ssn;
    this.upstream_stamp = hs_op_stamp;

    op_stream.on('op', this.onUpstreamOp.bind(this));
    op_stream.on('end', function (off) {
        self.dbos.writeOp(off);
    });
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
        if (!op_stream.hs) {
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
    if (this.db_id!==hs.id() && hs.id()!=='0') { // wrong db
        return reject ('wrong database id');
    }
    if (hs.stamp()==='0') { // new replica, no repl_id, no clocks
        var proposed_role = hs.spec.Type().time() || 'Client';
        if (!Replica.ROLES.hasOwnProperty(proposed_role)) {
            return reject('invalid role');
        }
        var new_role = proposed_role!=='Client' ?
            this.role + proposed_role : proposed_role;
        var role = new Lamp(new_role, 'Swarm');
        var stamp = this.clock.issueTimestamp();
        var strange_stamp = new LamportTimestamp(stamp.time(), '0');
        re_hs[0] = hs.spec
            .set(role, '/')
            .set(this.db_id, '#')
            .set(strange_stamp, '!');
        var relay_opts = Object.keys(this.options).filter(function(k){
            return k in Replica.RELAY_OPTIONS;
        });
        re_hs[2] = relay_opts.map(function(k){
            return ['!0.'+k, self.options[k]];
        });
    }
    try {
        next_policy();
    } catch (ex) {
        console.error(ex.stack);
        reject(ex.message);
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
        Replica.debug && console.warn('HS_ACCEPT', re.toString());
        op_stream.writeHandshake(re);
        self.dbos.writeOp(hs);
        op_stream.on('op', self.onDownstreamOp.bind(self));
        op_stream.on('end', self.onStreamEnd.bind(self));
        if (re.stamp()===undefined) {
            throw new Error('re hs is not stamped');
        }
        self.streams[re.stamp()] = op_stream;
        self.emit('connection', {
            op_stream: op_stream,
            upstream: false,
            repl_id: re.origin()
        });
    }
    function reject (reason) {
        Replica.debug && console.warn('HS_REJECT',reason);
        re_hs[0] = re_hs[0].set('.off');
        re_hs[1] = reason;
        op_stream.writeEnd(Op.create(re_hs));
    }
};


/**
 * We expect that we always receive 'end' and that we receive it once.
 */
Replica.prototype.onStreamEnd = function (off, op_stream) {
    // we trust the .off op as it is made by OpSource.js
    Replica.debug && console.warn('DOWNSTREAM_END', op_stream.source());
    var source_id = op_stream.source_id;
    if (this.streams[source_id]!==op_stream) {
        console.warn('no such source to remove');
        op_stream.removeAllListeners(); // kill it for sure
        return;
    }
    if (source_id === this.upstream_source_id) {
        this.upstream_source_id = null;
    }

    op_stream.removeAllListeners('handshake');
    op_stream.removeAllListeners('op'); // I'm the owner
    op_stream.removeAllListeners('end');

    if (off.value || !this.dbos) { // there is some error
        delete this.streams[source_id];
        op_stream.writeEnd('re:'+off.value);
        this.emit('disconnect', {
            hs: off,
            source_id: source_id,
            source: op_stream
        });
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
        activeSources: Object.keys(this.streams).length,
        preHSSources: Object.keys(this.pre_streams).length,
        pendingSync: Object.keys(this.pending_sync).length,
        allSources: -1
    };
    stats.allSources = stats.activeSources + stats.preHSSources;
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
