"use strict";
var Spec = require('./Spec');
//var Op = require('./Op');
var Host = require('./Host');
var EventEmitter = require('eventemitter3'); // TODO  '*' wildcard maybe
var util = require('util');

/**
 * Swarm objects are split into two orthogonal parts, kind of Jekyll and Hyde.
 * The inner state (CRDT) is a cleanroom math-only CRDT implementation.
 * It is entirely passive and perfectly serializable.
 * CRDT travels on the wire, gets saved into the DB, etc.
 * The outer state (Syncable) is a "regular" JavaScript object which is exposed
 * in the API. A Syncable is a mere projection of its CRDT. Still, all mutations
 * originate at a Syncable. This architecture is very similar to MVC, where
 * Syncable is a "View", CRDT is a "Model" and the Host is a "Controller".
 * All syncables are expected to inherit from Syncable.
 * @constructor
 */
function Syncable(init_op, host) {

    EventEmitter.call(this);
    /** The id of an object is typically the timestamp of the first
        operation. Still, it can be any Base64 string (see swarm-stamp). */
    this._id = null;
    /** Timestamp of the last change op. */
    this._version = '';
    // EventEmitter stuff
    this._events = {change: null};

    if (host===undefined) { // null means "no host"
        host = Host.defaultHost();
    }

    var copy = host && host.adoptSyncable(this, init_op);
    return copy; // JavaScript-specific trick: prevent object copies
}
util.inherits(Syncable, EventEmitter);
module.exports = Syncable;
Syncable.DEFAULT_TYPE = new Spec('/Model');

/** The Host this syncable is registered with (the db name, the user
 *  name and the session id). */
Syncable.prototype.ownerHost = function () {
    return Host.getOwnerHost(this);
};


Syncable.prototype._crdt = function () {
    return this.ownerHost().getCRDT(this);
};

//
Syncable.prototype.save = function () {
    var host = this.ownerHost();
    var clean_state = host.getCRDT().updateSyncable({});
    var diff = this.diff(clean_state);
    while (diff && diff.length) {
        host.submitOp(this, diff.unshift());
    }
};

//
Syncable.prototype.diff = function (base_state) {
    return [];
};


Syncable.prototype.submit = function (op_name, op_value) {
    this.ownerHost().submit(this, op_name, op_value);
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

Syncable.prototype.typeId = function () {
    return Spec.create(this._type, this._id, null, null);
};

// Returns current object state specifier
Syncable.prototype.stateSpec = function () {
    return this.spec() + (this._version || '!0');
};

/**
 *  The most correct way to specify a version in a distibuted system
 *  with partial order is a *version vector*. Unfortunately, a vvector
 *  may consume more space than the data itself in some cases.
 *  So, `version()` is not a version vector, but the last applied
 *  operation's timestamp (Lamport-like, i.e. "time+origin").
 *  It changes every time the object changes, but not monotonously.
 *  For a stateless object (e.g. the state did not arrive from the server
 *  yet), `o.version()===''`. For objects with the default state (no ops
 *  applied yet), `o.version()==='0'`. Deleted objects (no further
 *  writes possible) have `o.version()==='~'`. For a normal stateful
 *  object, version is the timestamp of the last op applied, according
 *  to the local order (in other replicas, the order may differ).
 */
Syncable.prototype.version = function () {
    return this._version;
};

/* External objects (those you create by supplying an id) need first to query
 * the upstream for their state. Until the state arrives, they are stateless.
 */
Syncable.prototype.hasState = function () {
    return !!this._version;
};
Syncable.prototype.isStateful = Syncable.prototype.hasState;


// Deallocate everything, free all resources.
Syncable.prototype.close = function () {
    this.ownerHost().abandonSyncable(this);
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

/** Syntactic sugar: if the object has the state already then invokes the
  * callback immediately; otherwise, waits for state arrival. */
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
