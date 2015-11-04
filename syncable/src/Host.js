'use strict';

var lamp64 = require('swarm-stamp');
var Spec =  require('./Spec');
var Op = require('./Op');
var Syncable = require('./Syncable');
var OpStream =  require('./OpStream');
var util         = require("util");
var EventEmitter = require("eventemitter3");

// Host is the world of actual Syncable CRDT objects of various types.
// A (full) Swarm node is Host+Storage+Router.
function Host (options) {
    this._events = {data: null};
    EventEmitter.call(this);
    // id, router, offset_ms
    this.options = options;
    this.ssn_id = null;
    this.db_id = null;
    this.clock = null;
    // syncables, API objects, outer state
    this.syncables = Object.create(null);
    // CRDTs, inner state
    this.crdts = Object.create(null);
    // pending writes to handle on replica reconnection
    this.unacked_ops = Object.create(null);
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
}
util.inherits(Host, EventEmitter);
module.exports = Host;
Host.debug = false;


Host.prototype.close = function () {
    if (Host.localhost===this) {
        Host.localhost = null;
    }
};

// mark-and-sweep kind-of distributed garbage collection
Host.prototype.gc = function (criteria) {
    // NOTE objects in this.pending can NOT be gc'd
};

// Emit subscriptions for all the open objects, include
// last known versions and patches for unacknowledged ops.
Host.prototype.replaySubscriptions = function (stream) {
    var hs = this.handshake();
    if (hs) {
        this.emit('data', hs);
    }
    var typeids = Object.keys(this.syncables);
    for(var i=0; i<typeids.length; i++) {
        var typeid = typeids[i];
        var crdt = this.crdts[typeid];
        var unack = this.unacked_ops[typeid];
        var op = new Op(typeid+'!'+this.run_id+'.on', this.run_id);
        if (crdt) {
            op.value - crdt._version;
            if (unack) {
                op.patch = unack;
            }
        }
        this.emit('data', op);
    }
};


Host.prototype.handshake = function () {
    if (!this.ssn_id || !this.db_id) { return null; }
    var key = new Spec.Parsed('/Swarm+Host').add(this.db_id, '#')
        .add(this.time(),'!').add('.on');
    this.run_id = key.stamp(); // FIXME run_id
    console.warn('not this way');
    return new Op(key, '', this.run_id);
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
Host.prototype.write = function (op) {

    var typeid = op.spec.typeid(), stamp = op.stamp(), self=this;
    var syncable = this.syncables[typeid];
    var crdt = this.crdts[typeid];
    if (!syncable) {
        throw new Error('syncable not open');
    }

    switch (op.op()) {
    case 'on':
        op.patch && op.patch.forEach(function(op){
            self.write(op);
        });


        /*crdt.updateSyncable(syncable);
        syncable.emit('change', {
            version: crdt._version,
            changes: null
        });*/


        break;
    case 'off':
        break;
    case '~state':
        var type_fn = Syncable.types[op.spec.type()];
        if (!type_fn) {
            throw new Error('type unknown');
        }
        crdt = this.crdts[typeid] = new type_fn.Inner(op.value);


        // FIXME pending state!!!


        crdt.updateSyncable(syncable);
        syncable._version = crdt._version = stamp;
        syncable.emit('init', {
            version: crdt._version,
            changes: null
        });
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

        var pending = this.unacked_ops[typeid];
        if (pending && op.origin()===this.ssn_id) {
            while (pending.length && pending[0].stamp()<=stamp) {
                pending.shift();
            }
            if (!pending.length) {
                delete this.unacked_ops[typeid];
            }
        }

        crdt.updateSyncable(syncable);
        syncable._version = crdt._version = stamp;
        syncable.emit('change', {
            version: crdt._version,
            changes: null
        });
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
        var on_spec = syncable.spec().add('!0').add('.on');
        on_op = new Op(on_spec, '0', this.run_id, [state_op]);

    } else {
        var spec = syncable.spec().toString();
        if (spec in this.syncables) {
            return this.syncables[spec]; // there is such an object already
        }
        // 0 up
        on_op = new Op(syncable.spec().add('!0').add('.on'), '', this.run_id);
    }

    this.syncables[syncable.spec().typeid()] = syncable;  // OK, remember it
    syncable._owner = this;
    if (on_op.patch) {
        this.unacked_ops[typeid] = on_op.patch.slice(); // FIXME state needs an ack
    }
    this.emit('data', on_op);

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
        this.emit('data', off_op);
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
    var typeid = syncable.typeid();
    var crdt = this.crdts[typeid];
    if (!crdt) {
        throw new Error('have no state, can not modify');
    }
    var spec = syncable.spec().add(this.time(), '!').add(op_name,'.');
    var op = new Op(spec, value, this.run_id); // FIXME run vs ssn vs conn id

    var pending = this.unacked_ops[typeid];
    if (!pending) {
        pending = this.unacked_ops[typeid] = [];
    }
    pending.push(op);

    this.write(op);
    this.emit('data', op);
};


Host.prototype.end = function () {
    this.emit('end');
};
Host.prototype.pause = function () {
};
Host.prototype.pipe = function (opstream) {
    this.on('data', opstream.write.bind(opstream));
};
Host.prototype.peerSessionId = function () {
    return this.ssn_id;
};
Host.prototype.peerSessionStamp = function () {
    return this.run_id;
};
Host.prototype.sendHandshake = function (hs) {
    console.warn('FIXME local handshake', hs);
    this.replaySubscriptions();
};
