'use strict';
var SwarmStamp = require('swarm-stamp');
var Lamp = SwarmStamp.LamportTimestamp;
var Spec = require('./Spec');
var Op = require('./Op');
var util = require("util");
var OpSource = require("./OpSource");

/**
 * Host is the world of actual replicated/synchronized objects of various types.
 * Host contains inner CRDT objects and their outer API parts (Syncables).
 * A host is (a) passive and (b) synchronous.
 * Host has an OpSource interface, consuming and emitting ops.
 * To keep a host synchronized, it has to be connected to some
 * transport/storage, e.g. see `swarm-replica`. As a Host has no own storage,
 * it does not persist any information between runs. Hence, it dies once
 * disconnected from its upstream (Replica).
 *
 * Host implements generic events for Syncables. Namely, on every state
 * change, every syncable emits a `change` event. Once the state is first
 * obtained, `init` event is also emitted. Newly created objects
 * (like `new Model()`) get their state immediately. Objects retrieved
 * by their id remain stateless till some state arrives from a local
 * cache or an upstream server.
 * @class
 * @implements {OpSource}
 */
function Host (options) {
    options = options || {};
    this._events = {data: null};
    OpSource.call(this, options);
    // id, router, offset_ms
    this.options = options;
    /** Id of this session (replica in the general sense).
        ssn_id of a Host is derived from the ssn_id of its upstream
        replica e.g. `user~repl => user~repl~host`. */
    this.ssn_id = null;
    /** id of the owner (user). */
    //this.user_id = options.user_id || null;
    /** database id */
    this.db_id = null;
    /** Clock used to stamp all events originated at this Host.
        Produces Lamport timestamps (`timestamp+user~session`) */
    this.clock = null;
    /** syncables, API objects, the outer state */
    this.syncables = Object.create(null);
    /** CRDTs, the inner state */
    this.crdts = Object.create(null);
    if (options.db_id) {
        this.db_id = options.db_id;
        if (options.clock) {
            this.clock = options.clock;
            this.ssn_id = this.clock.origin; // FIXME
        } else if (options.ssn_id) {
            this.ssn_id = options.ssn_id;
            this.createClock(this.db_id, this.ssn_id);
        }
    }
    if (!Host.multihost) {
        if (Host.localhost) {
            throw new Error('not in multihost mode');
        }
        Host.localhost = this;
    }
    this.go();
}
util.inherits(Host, OpSource);
module.exports = Host;

Host.debug = false;
Host.multihost = false;
Host.localhost = null;
Host.hosts = Object.create(null);

Host.prototype.go = function () {
    var hs = new Spec('/Host+Swarm').add(this.db_id||'0', '#');
    if (this.clock) {
        hs = hs.add(this.clock.issueTimestamp(), '!');
    } else if (this.ssn_id) {
        hs = hs.add(this.ssn_id, '!');
    } else {
        hs = hs.add('!0');
    }
    hs = hs.add('.on');

    this.emitHandshake(hs, '');

    var pre = Object.keys(this.syncables);
    for(var i=0; i<pre.length; i++) {
        var obj = this.syncables [pre[i]];

        // FIXME wait for re_hs, no !0

        this.emitOp(obj.typeid()+'!0.on', obj._version||'');
    }
};


Host.defaultHost = function () {
    if (!Host.localhost) {
        throw new Error('no host specified');
    } else {
        if (Host.multihost) {
            console.warn('implicit host in mutihost mode');
        }
        return Host.localhost;
    }
};


Host.getOwnerHost = function (syncable) {
    if (Host.multihost) {
        return Host.hosts[syncable._ssn];
    } else {
        return Host.localhost;
    }
};


// import Syncable only after exporting Host - Syncable will import Host
// itself, so otherwise it will get an incomplete object.
var Syncable = require('./Syncable');

Host.prototype.close = function () {
    if (Host.localhost===this) {
        Host.localhost = null;
    }
};

// mark-and-sweep kind-of distributed garbage collection
Host.prototype.gc = function (criteria) {
    // NOTE objects in this.pending can NOT be gc'd
};


// Returns a new timestamp from the host's clock.
Host.prototype.time = function () {
    return this.clock ? this.clock.issueTimestamp() : null;
};

// An innner state getter; needs /type#id spec for the object.
Host.prototype.getCRDT = function (obj) {
    if (obj._type) {
        if (this.syncables[obj.typeid()]!==obj) {
            throw new Error('an alien object');
        }
        return this.crdts[obj.typeid()];
    } else {
        return this.crdts[new Spec(obj).typeid()];
    }
};

// does not interfere with Replica clock
Host.prototype.createClock = function (db_id, ssn_id) {
    if (this.clock) {
        throw new Error('already have clock');
    }
    var options = this.options;
    ssn_id = ssn_id || options.ssn_id;
    db_id = db_id || options.db_id;
    if (!options.clock) {
        this.clock = new SwarmStamp.Clock(ssn_id);
    } else if (options.clock.constructor===Function) {
        this.clock = new options.clock(ssn_id);
    } else {
        this.clock = options.clock;
    }
    var lamp = new Lamp(ssn_id);
    this.ssn_id = lamp.origin();
    //this.user_id = lamp.author();
    this.db_id = db_id;
    if (this.syncables && Host.multihost) {
        var ids = Object.keys(this.syncables);
        var mark = this.getSsnMark();
        for(var i=0; i<ids.length; i++) {
            this.syncables[ids[i]]._ssn = mark;
        }
    }
    if (Host.multihost) {
        Host.hosts[this.getSsnMark()] = this;
    }
    this.emit('writable');
};


Host.prototype.getSsnMark = function () {
    return this.db_id + '+' + this.ssn_id;
};


Host.prototype._writeHandshake = function (op) {
    var options = this.options;
    var lamp = new Lamp(op.value);
    var new_ssn = lamp.origin();
    if (!this.clock) {
        // get ssn, adjust clocks
        if (options.db_id && options.db_id!==op.id()) {
            this.emitEnd('handshake for a wrong database');
        } else {
            this.createClock(op.id(), new_ssn); // FIXME check monotony
        }
    } else if (op.id()!==this.db_id || (new_ssn && new_ssn!==this.ssn_id)) {
        // check everything matches
        this.emitEnd('handshake mismatch');
    }
};

// Applies a serialized operation (or a batch thereof) to this replica
Host.prototype._writeOp = function (op) {

    var typeid = op.spec.typeid();
    if (!typeid || typeid==='null') {
        throw new Error('what?');
    }

    if (op.spec.Type().time()==='Swarm') {
        return this.writeHandshake(op);
    }
    // NOTE that a snap slave host has no clocks and still functions
    // TODO replica/ SnapshotSlave.js

    if (op.origin()===this.ssn_id) {
        if (op.stamp()>this.hs.stamp()) { // an echo
            this.emit('echo', {
                version: op.stamp(),
                op:      op
            });
            // FIXME CRITICAL: test for old ops loaded (prev run id)
            return;
        }
    }

    var syncable = this.syncables && this.syncables[typeid];
    if (!syncable && this.options.api!==false) {
        this.emitOp(op.spec.set('.error'), 'syncable not open');
    } else {// FIXME snapshot slave
        this.consumeOpAndUpdate(op);
    }

};


Host.prototype.consumeOpAndUpdate = function (op) {

    var typeid = op.spec.typeid();

    var crdt = this.crdts[typeid];
    var old_version = crdt && crdt._version;

    this.consumeOp(op);

    crdt = this.crdts[typeid];
    var new_version = crdt._version;

    if (new_version!==old_version) {
        // We bundle events (e.g. a sequence of ops we
        // received on handshake after spending some time offline).
        // FIXME descending state!!! see the pacman note
        var syncable = this.syncables[typeid];
        crdt.updateSyncable(syncable, this.get.bind(this));
        // FIXME get rid of 'init' which is only used by onInit()
        if (!old_version) {
            syncable.emit('init', {
                version: crdt._version,
                changes: null,
                target: syncable,
                op: op
            });
        }
        syncable.emit('change', {
            version: crdt._version,
            changes: null,
            target:  syncable,
            op:      op
        });
    }

};


Host.prototype.consumeOp = function (op) {
    var typeid = op.typeid();
    var crdt = this.crdts[typeid];
    Host.debug && console.warn('HOST_CONSUME', op.toString());

    switch (op.name()) {
    case 'on':
        if (op.patch) {
            for (var i=0; i < op.patch.length; i++) {
                this.consumeOp(op.patch[i]);
            }
        }
        crdt = this.crdts[typeid];
        break;
    case 'off':
        if (this.syncables && this.syncables[typeid]) {
            console.warn('upstream disappears for', typeid);
        } else {
            delete this.crdts[typeid];
            this.emitOp(typeid+'.off', '');
        }
        break;
    case '~state':
        var type_fn = Syncable.types[op.spec.type()];
        if (!type_fn) {
            throw new Error('type unknown');
        }
        var have_or_wait_state = this.crdts[typeid]!==undefined;
        crdt = new type_fn.Inner(op.value);
        crdt._version = op.stamp();
        this.crdts[typeid] = crdt;
        if (!have_or_wait_state) { // FIXME obey  ??!!!
            this.emit ('op', new Op(typeid+'.on', op.spec.stamp(), this.source()));
        }
        break;
    case 'error':
        // As all the event/operation processing is asynchronous, we
        // cannot simply throw/catch exceptions over the network.
        // This method allows to send errors back asynchronously.
        // Sort of an asynchronous complaint mailbox :)
        console.error('something failed:', ''+op.spec, op.value);
    break;
    default: // actual ops
        if (!crdt) {
            throw new Error('CRDT object was not initialized');
        }
        crdt.write(op);
        crdt._version = op.stamp();
        // replay protection - either Replica or an idempotent type
        // if (this.syncables) {
        //     syncable._version = crdt._version;
        // }

    }

    // NOTE: merged ops, like
    //      !time+src.in text
    // should have their *last* stamp in the spec
};


// Incorporate a syncable into this replica.
// In case the object is newly created (like `new Model()`), Host
// assigns an id and saves it. For a known-id objects
// (like `new Model('2THjz01+gritzko~cA4')`) the state is queried
// from the storage/uplink. Till the state is received, the object
// is stateless (`syncable.version()===undefined && !syncable.hasState()`)
Host.prototype.adoptSyncable = function (syncable, init_op) {
    var type = syncable._type, typeid;
    var type_fn = Syncable.types[type];
    if (!type_fn || type_fn!==syncable.constructor) {
        throw new Error('not a registered syncable type');
    }
    if (syncable._ssn) {
        throw new Error('the syncable belongs to some host already');
    }

    if (!syncable._id) { // it is a new object; let's add it to the system
        if (!this.clock) {
            throw new Error('Host has no clocks, hence not writable');
        }
        var stamp = this.time().toString();
        syncable._id = stamp;
        var typeId = syncable.typeId(); typeid = typeId.toString();
        Host.debug && console.warn('HOST_CREATE', typeid);

        var crdt = new syncable.constructor.Inner(null, syncable); // 0 state
        if (init_op) {
            var stamped_spec = typeId.add(stamp,'!').add(init_op.op(),'.');
            var stamped_op = new Op(stamped_spec, init_op.value, this.source());
            crdt.write(stamped_op);
        }
        this.crdts[typeid] = crdt;
        crdt._version = stamp;
        crdt.updateSyncable(syncable, this.get.bind(this));
        syncable._version = crdt._version = stamp;

        // the state is sent up in the handshake as the uplink has nothing
        var on_spec = syncable.spec().add(this.source_id, '!').add('.on'); //.add(stamp,'!')
        this.emitOp(on_spec, '', [[
            typeid+'!'+stamp+'.~state',
            crdt.toString()
        ]]);

    } else {
        typeid = syncable.typeid();
        if (typeid in this.syncables) {
            return this.syncables[typeid]; // there is such an object already
        }
        this.crdts[typeid] = null; // wait for the state
        Host.debug && console.warn('HOST_SUB', typeid);
        // 0 up
        this.emitOp(syncable.spec().add(this.source_id, '!').add('.on'), '');
    }

    this.syncables[typeid] = syncable;  // OK, remember it
    if (Host.multihost) {
        syncable._ssn = this.getSsnMark() || null;
    }
    // if (on_op.patch) {
    //     this.unacked_ops[typeid] = on_op.patch.slice(); // FIXME state needs an ack
    // }

    return syncable;
};


Host.prototype.abandonSyncable = function (obj) {
    var typeid = obj.spec().typeid();
    if (typeid in this.syncables) {
        if (this.syncables[typeid]!==obj) {
            throw new Error('the registered object is different');
        }
        delete this.syncables[typeid];
        var off_spec = obj.spec().add('.off');
        this.emitOp (off_spec, '');
    }
};

var just_model = new Spec('/Model'); // FIXME

// Retrieve an object by its spec (type and id).
// Optionally, invoke a callback once the state is actually available.
Host.prototype.get = function (spec, callback) {
    if (!spec) {
        spec = new Spec(just_model);
    } else if (spec.constructor!==Spec) {
        var str = spec.toString();
        if (Lamp.is(str)) {
            spec = new Spec('#'+str, just_model);
        } else if (Spec.is(str)) {
            spec = new Spec(str, null, just_model);
        } else {
            throw new Error('incorrect spec');
        }
    } else if (!spec.type()) {
        throw new Error('type not specified');
    }
    var type_fn = Syncable.types[spec.type()];
    if (!type_fn) {
        throw new Error('type unknown: ' + spec.type());
    }
    var object;
    if (spec.id()) {
        var typeid = spec.typeid();
        object = this.syncables[typeid];
        if (!object) {
            object = new type_fn(null, null);
            object._id = spec.id();
            this.adoptSyncable(object);
        }
    } else {
        object = new type_fn(null, this);
    }
    if (callback) {
        object.onInit(callback);
    }
    return object;
};

// author a new operation
Host.prototype.submit = function (syncable, op_name, value) { // TODO sig
    if (Host.multihost && syncable!==this.syncables[syncable.typeid()]) {
        throw new Error('alien op submission');
    }
    if (!this.clock) {
        throw new Error('host has no clock, hence not writable');
    }
    var typeid = syncable.typeid();
    this.clock.seeStamp(syncable._version||'0'); // FIXME don't read syncable.
    var spec = new Spec(typeid).add(this.time(),'!').add(op_name,'.');
    var op = new Op(spec, value, this.source());
    this.submitOp(op);
};


Host.prototype.submitOp = function (op) { // TODO sig
    var typeid = op.typeid();
    var syncable = this.syncables[typeid];
    if (!syncable) {
        throw new Error('object is not open');
    }
    var crdt = this.crdts[typeid];
    if (!crdt) {
        throw new Error('have no state, hence can not modify');
    }

    this.consumeOpAndUpdate(op);
    this.emitOp(op.spec, op.value); // FIXME ugly
};


Host.prototype._writeEnd = function (op, callback) {
    this.emitEnd(op);
    callback && callback();
};
