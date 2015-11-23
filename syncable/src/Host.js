'use strict';
var lamp64 = require('swarm-stamp');
var Spec = require('./Spec');
var Op = require('./Op');
var Syncable = require('./Syncable');
var util = require("util");
//var EventEmitter = require("eventemitter3");
var Duplex = require('readable-stream').Duplex;

// Host is the world of actual replicated/synchronized objects of various types.
// Host contains inner CRDT objects and their outer API parts (Syncables).
// A host is (a) passive and (b) synchronous.
// Host has an OpStream-like interface, consuming and emitting ops.
// To keep a host synchronized, it has to be connected to some
// transport/storage, e.g. see `swarm-replica`. As a Host has no own storage,
// it does not persist any information between runs. Hence, it dies once
// disconnected from the upstream (Replica).
// If assigned dynamically, ssn_id of a Host is derived from
// the ssn_id of its Replica (the same for the first host, ~1 for the next, etc)
function Host (options) {
    this._events = {data: null};
    Duplex.call(this, {objectMode: true});
    // id, router, offset_ms
    this.options = options;
    this.ssn_id = null;
    this.db_id = null;
    this.clock = null;
    // syncables, API objects, outer state
    this.syncables = options.api===false ? null : Object.create(null);
    // CRDTs, inner state
    this.crdts = Object.create(null);
    this.run_id = null;
    if (options.ssn_id) {
        this.ssn_id = options.ssn_id;
    }
    if (options.clock) {
        this.clock = options.clock;
    } else if (this.ssn_id) {
        this.clock = new lamp64.Clock(this.ssn_id);
    }
    if (options.db_id) {
        this.db_id = options.db_id;
    }
    if (!Host.multihost) {
        if (Host.localhost) {
            throw new Error('not in multihost mode');
        }
        Host.localhost = this;
    }
    this.push(this.handshake());
}
util.inherits(Host, Duplex);
module.exports = Host;
Host.debug = false;


/*Host.prototype.emitSubscriptions = function () {
    var statefuls = Object.keys(this.crdts).sort();
    for(var i=0; i<statefuls.length; i++) {
        var typeid = statefuls[i];
        var crdt = this.crdts[typeid];
        crdt && this.emit('data', new Op(typeid+'.on', crdt._version));
    }
    if (this.syncables) {
        var keys = Object.keys(this.syncables).sort();
        for(i=0; i<keys.length; i++) {
            typeid = keys[i];
            if (this.crdts[typeid]) { continue; }
            this.emit('data', new Op(typeid+'.on', ''));
        }
    }
};*/

Host.prototype._read = function () {
    return;
};


Host.prototype.close = function () {
    if (Host.localhost===this) {
        Host.localhost = null;
    }
};

// mark-and-sweep kind-of distributed garbage collection
Host.prototype.gc = function (criteria) {
    // NOTE objects in this.pending can NOT be gc'd
};


Host.prototype.handshake = function () {
    var stamp = '0';
    if (this.clock) {
        stamp = this.time();
    } else if (this.user_id) {
        stamp = this.user_id;
    }
    var key = new Spec.Parsed('/Swarm+Host').add(this.db_id||'0', '#')
        .add(stamp,'!').add('.on');
    return new Op(key, '');
};

// Returns a new timestamp from the host's clock.
Host.prototype.time = function () {
    return this.clock ? this.clock.issueTimestamp() : null;
};

// An innner state getter; needs /type#id spec for the object.
Host.prototype.getCRDT = function (obj) {
    if (obj._type) {
        if (obj._owner!==this) {
            throw new Error('an alien object');
        }
        return this.crdts[obj.typeid()];
    } else {
        return this.crdts[new Spec.Parsed(obj).typeid()];
    }
};

// Applies a serialized operation (or a batch thereof) to this replica
Host.prototype._write = function (op, encoding, callback) {

    var typeid = op.spec.typeid(), stamp = op.stamp(), self=this;
    if (!typeid || typeid==='null') {
        throw new Error('what?');
    }

    if (op.spec.Type().time()==='Swarm') {
        if (op.spec.op()==='error') {
            console.error('handshake fails', op.value);
            return;
        } if (!this.clock) {
            // get ssn, adjust clocks
        } else {
            // check everything matches
        }
    }

    var syncable = this.syncables && this.syncables[typeid];
    var crdt = this.crdts[typeid];
    if (!syncable && this.options.api!==false) {
        throw new Error('syncable not open');
    } // FIXME specify modes: api, obey, snapshot

    switch (op.op()) {
    case 'on':
        op.patch && op.patch.forEach(function(op){
            self.write(op);
        });

        /*   TODO bundle 'change' events
        crdt.updateSyncable(syncable);
        syncable.emit('change', {
            version: crdt._version,
            changes: null
        });*/

        break;
    case 'off':
        if (this.syncables && this.syncables[typeid]) {
            console.warn('upstream disappears for', typeid);
        } else {
            delete this.crdts[typeid];
            this.push(new Op(typeid+'.off', ''));
        }
        break;
    case '~state':
        var type_fn = Syncable.types[op.spec.type()];
        if (!type_fn) {
            throw new Error('type unknown');
        }
        var have_or_wait_state = this.crdts[typeid]!==undefined;
        crdt = new type_fn.Inner(op.value);
        this.crdts[typeid] = crdt;
        if (!have_or_wait_state) { // FIXME obey
            this.push(new Op(typeid+'.on', op.spec.stamp()));
        }

        // FIXME descending state!!! see the pacman note
        if (this.syncables) {
            crdt.updateSyncable(syncable);
            syncable._version = crdt._version = stamp;
            syncable.emit('init', {
                version: crdt._version,
                changes: null
            });
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
        crdt = this.crdts[typeid];
        if (!crdt) {
            throw new Error('CRDT object was not initialized');
        }
        crdt.write(op);
        // replay protection - either Replica or an idempotent type
        if (this.syncables) {
            crdt.updateSyncable(syncable);
            syncable._version = crdt._version = stamp;
            syncable.emit('change', {
                version: crdt._version,
                changes: null
            });
        }

        if (this.options.snapshot==='immediate') {
            var spec = op.spec.set('~state', '.');
            this.push(new Op(spec, crdt.toString()));
        }

    }

    if (callback) {
        callback();
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
    var type = syncable._type, on_op;
    var type_fn = Syncable.types[type];
    if (!type_fn || type_fn!==syncable.constructor) {
        throw new Error('not a registered syncable type');
    }
    if (syncable._owner) {
        throw new Error('the syncable belongs to some host already');
    }

    if (!syncable._id) { // it is a new object; let's add it to the system

        var stamp = this.time();
        syncable._id = stamp;
        var typeid = syncable.spec();
        var crdt = new syncable.constructor.Inner(null, syncable); // 0 state
        if (init_op) {
            var stamped_spec = typeid.add(stamp,'!').add(init_op.op(),'.');
            var stamped_op = new Op(stamped_spec, init_op.value, this.run_id);
            crdt.write(stamped_op);
        }
        this.crdts[typeid] = crdt;
        crdt._version = stamp;
        crdt.updateSyncable(syncable);
        syncable._version = crdt._version = stamp;

        // the state is sent up in the handshake as the uplink has nothing
        var state_op = new Op(typeid+'!'+stamp+'.~state', crdt.toString(), this.run_id);
        var on_spec = syncable.spec().add('.on');
        on_op = new Op(on_spec, '0', this.run_id, [state_op]);

    } else {
        var spec = syncable.spec().toString();
        if (spec in this.syncables) {
            return this.syncables[spec]; // there is such an object already
        }
        this.crdts[syncable.spec().typeid()] = null; // wait for the state
        // 0 up
        on_op = new Op(syncable.spec().add('.on'), '', this.run_id);
    }

    this.syncables[syncable.spec().typeid()] = syncable;  // OK, remember it
    syncable._owner = this;
    // if (on_op.patch) {
    //     this.unacked_ops[typeid] = on_op.patch.slice(); // FIXME state needs an ack
    // }
    this.push(on_op);

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
        var off_op = new Op (off_spec, '', this.run_id);
        this.push(off_op);
    }
};

var just_model = new Spec.Parsed('/Model'); // FIXME

// Retrieve an object by its spec (type and id).
// Optionally, invoke a callback once the state is actually available.
Host.prototype.get = function (spec, callback) {
    if (spec.constructor===Function) {
        spec = new Spec.Parsed('/'+spec._type);
    }
    if (spec.constructor!==Spec.Parsed) {
        spec = new Spec.Parsed(spec.toString(), null, just_model);
    }
    if (!spec.type()) {
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
    if (syncable._owner!==this) {
        throw new Error('alien op submission');
    }
    if (!this.clock) {
        throw new Error('host has no clock, hence not writable');
    }
    var typeid = syncable.typeid();
    var crdt = this.crdts[typeid];
    if (!crdt) {
        throw new Error('have no state, can not modify');
    }
    var spec = syncable.spec().add(this.time(), '!').add(op_name,'.');
    var op = new Op(spec, value, this.run_id); // FIXME run vs ssn vs conn id

    this._write(op); // not recommended by node docs :)
    this.push(op);
};


Host.prototype.__end = Host.prototype.end;
Host.prototype.end = function (chunk, enc, cb) {
    this.__end(chunk, enc, cb);
    this.push(null);
};

/*Host.prototype.end = function () {
    this.emit('end');
};
Host.prototype.pause = function () {
};

// Emit subscriptions for all the open objects, include
// last known versions and patches for unacknowledged ops.
Host.prototype.pipe = function (opstream) {
    this.on('data', opstream.write.bind(opstream));
};
*/
Host.prototype.peerSessionId = function () {
    return this.ssn_id;
};
Host.prototype.peerSessionStamp = function () {
    return this.run_id;
};
