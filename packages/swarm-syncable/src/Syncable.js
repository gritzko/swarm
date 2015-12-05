"use strict";

var Spec = require('./Spec');
var Op = require('./Op');
var Host = require('./Host');
var EventEmitter = require('eventemitter3'); // TODO  '*' wildcard maybe
var util = require('util');

/** Syncable CmRDT objects use state machine replication. The only
 * difference from the classic case is that operations are not linear
 * but partially ordered (http://bit.ly/1Nl3ink, http://bit.ly/1F07aZ0)
 * Thus, a state of a Syncable object is transferred to a replica using
 * some combination of state snapshots (POJO) and operation logs.
 * The .init pseuso-operation ferries those from replica to replica.
 * init may carry a state snapshot or an oplog tail or both or none.
 * The format of the init value object is POJO JSON state and
 * special fields: _tail, _version (the latter flags presence of a POJO
 * state).
 * .init is normally produced in the handshake phase, as a response to
 * .on or .reon. Later on, any real-time changes are transferred as
 * individual operations.
 * Init is considered a neutral pseudo-op, albeit it may emit the "init"
 * event if it actually initializes the state.
 * It might have been possible to split .init into a "true" op .state
 * and separate operations of the tail, but we need some atomicity here.
 * @this {Syncable}
 */


/**
 * All CRDT model classes must extend syncable directly or indirectly. Syncable
 * provides all the necessary oplog- and state-related primitives and methods.
 * Every state-mutating method should be explicitly declared to be wrapped
 * by extend() (see 'ops', 'neutrals', 'remotes' sections in class declaration).
 * @param {function|string} fn
 * @param {{ops:object, neutrals:object, remotes:object}} own
 */
/**
 * Syncable: an oplog-synchronized object
 * Syncable(spec|id|state[,host])
 * @constructor
 */
 // please call Syncable.constructor.apply(this,args) in your constructor
 // The most correct way to specify a version is the version vector,
 // but that one may consume more space than the data itself in some cases.
 // Hence, _version is not a fully specified version vector (see version()
 // instead). _version is essentially is the greatest operation timestamp
 // (Lamport-like, i.e. "time+source"), sometimes amended with additional
 // timestamps. Its main features:
 // (1) changes once the object's state changes
 // (2) does it monotonically (in the alphanum order sense)


function Syncable(init_op, host) {

    EventEmitter.call(this);
    this._id = null;
    this._version = null;
    this._owner = null;
    this._events = {change: null};

    if (host===undefined) { // null means "no host"
        if (!Host.localhost) {
            throw new Error('no host specified');
        } else {
            Host.multihost && console.warn('implicit host in mutihost mode');
            host = Host.localhost;
        }
    }

    var copy = host && host.adoptSyncable(this, init_op);
    return copy; // JavaScript-specific trick: prevent object copies
}
util.inherits(Syncable, EventEmitter);
module.exports = Syncable;


Syncable.prototype._crdt = function () {
    return this.host().getCRDT(this);
};

//
Syncable.prototype.save = function () {
    var host = this.host();
    var clean_state = host.getCRDT().updateSyncable({});
    var diff = this.diff(clean_state);
    while (diff && diff.length) {
        this._owner.submitOp(this, diff.unshift());
    }
};

//
Syncable.prototype.diff = function (base_state) {
    return [];
};


Syncable.prototype.submit = function (op_name, op_value) {
    this._owner.submit(op_name, op_value);
};


Syncable.prototype.host = function () {
    return Host.multihost ? this._owner : Host.localhost;
};

//
Syncable.registerType = function (name, type) {
    if (!type || type.constructor!==Function) {
        throw new Error("please provide a constructor");
    }
    if (!type.Inner || type.Inner.constructor!==Function) {
        throw new Error("please provide an inner state constructor");
    }
    if (!name || name.constructor!==String || !/[A-Z]\w+/.test(name)) {
        throw new Error('invalid class name');
    }
    Syncable.types[name] = type;
    type.prototype._type = name; // TODO multiple-reg
    type.Inner.prototype._type = name; // TODO multiple-reg
};
Syncable.types = {};
Syncable.reMethodName = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;

Syncable.Inner = require('./CRDT');
Syncable.registerType('Syncable', Syncable);


// A *reaction* is a hybrid of a listener and a method. It "reacts" on a
// certain event for all objects of that type. The callback gets invoked
// as a method, i.e. this===syncableObj. In an event-oriented architecture
// reactions are rather handy, e.g. for creating mixins.
// @param {string} op operation name
// @param {function} fn callback
// @returns {{op:string, fn:function}}
Syncable.addReaction = function (op, fn) {
    var reactions = this.prototype._reactions;
    var list = reactions[op];
    list || (list = reactions[op] = []);
    list.push(fn);
    return {op: op, fn: fn};
};


Syncable.removeReaction = function (handle) {
    var op = handle.op,
        fn = handle.fn,
        list = this.prototype._reactions[op],
        i = list.indexOf(fn);
    if (i === -1) {
        throw new Error('reaction unknown');
    }
    list[i] = undefined; // such a peculiar pattern not to mess up out-of-callback removal
    while (list.length && !list[list.length - 1]) {
        list.pop();
    }
};


Syncable.prototype.spec = function () {
    return new Spec('/' + this._type + '#' + this._id);
};


Syncable.prototype.typeid = function () {
    return '/' + this._type + '#' + this._id;
};


// Returns current object state specifier
Syncable.prototype.stateSpec = function () {
    return this.spec() + (this._version || '!0');
};


/** Syncable object version transitions:
 *
 *             ''                    state unknown
 *              ↓
 *             !0                    default/initial state
 *              ↓
 *   ↻ !time1+src1!time2+src2        version vector
 *              ↓
 *             !~                    deleted
 *
 * @returns {Spec.Map} the version vector for this object
 */
Syncable.prototype.version = function () {
    return this._version;
};

// External objects (those you create by supplying an id) need first to query
// the uplink for their state. Before the state arrives they are stateless.
Syncable.prototype.hasState = function () {
    return !!this._version;
};
Syncable.prototype.isStateful = Syncable.prototype.hasState;


// Deallocate everything, free all resources.
Syncable.prototype.close = function () {
    this.host().abandonSyncable(this);
};

// Once an object is not listened by anyone it is perfectly safe
// to garbage collect it.
Syncable.prototype.gc = function () {
    if (!this.listenerCount('change')) { // FIXME
        this.close();
    }
};


Syncable.prototype.onLoad = function (callback) {
    // FIXME .4 wait all Refs to load
    // FIXME no refs => same as .init
    this.once('load', callback);
};

// Syntactic sugar: invokes the callback immediately if the object has
// state or waits for state arrival, i.e. once('init', callback).
Syncable.prototype.onInit = function (callback) {
    if (this.isStateful()) {
        // if a callback flaps between sync and async execution
        // that causes much of confusion, so let's force it to async
        setTimeout(callback.bind(this), 0);
    } else {
        this.once('init', callback);
    }
};

Syncable.reFieldName = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;

Syncable.getType = function (type_id) {
    if (Spec.is(type_id)) {
        return Syncable.types[new Spec(type_id).type()] || undefined;
    } else {
        return Syncable.types[type_id] || undefined;
    }
};
