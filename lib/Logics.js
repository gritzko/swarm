'use strict';

var env = require('./env');
var Spec = require('./Spec');
var Op = require('./Op');
var Syncable = require('./Syncable');
var Host = require('./Host');

/**
 * A (full) Swarm peer is Storage+Host+Logics. Logics is the world
 * of actual Syncable CRDT objects of various types.
 */
function Logics (host) {
    this.id = '0+'+host.id;
    this.host = host;
    this.syncables = {};
}
module.exports = Logics;

Logics.prototype.deliver = function (op) {
    var id = op.id();
    var obj = this.syncables[id];
    if (obj) {
        obj.deliver(op);
    } else {
        console.warn('no such syncable', op.id(), ''+op);
    }
};

/**
 * Register a syncable object.
 */
Logics.prototype.linkSyncable = function (spec, obj) {
    var id = spec.id();
    if (id in this.syncables) { // FIXME types
        return this.syncables[id]; // there is such an object already
    }
    this.syncables[id] = obj;  // OK, remember it
    // for newly created objects, the state is pushed ahead of the
    // handshake as the uplink certainly has nothing
    if (obj._id===obj._version.substr(1)) {
        var state = JSON.stringify(obj.toPojo(false));
        var ev_spec = obj.spec().add(obj._id,'!').add('.state');
        this.host.storage.deliver(new Op(ev_spec, state, this.id));
    }
    // Unified local and remote subscriptions:
    // !0 fictive subscription (like we are root, but send a preon)
    // !0+myself subscription by the local logix ("zero pipe")
    // !time+peer incoming (downstream) pipe subscription
    // !time+myself outgoing (upstream) subscription
    var on = new Op(obj.spec().add(this.id,'!').add('.on'), obj._version, this.id);
    this.host.deliver(on);
    return obj;
};

Logics.prototype.unlinkSyncable = function (obj) {
    var id = obj._id;
    if (id in this.syncables) {
        if (this.syncables[id]!==obj) {
            throw new Error('the registered object is different');
        }
        delete this.syncables[id];
        var off_spec = obj.spec().add('!0').add('.off');
        this.host.deliver(new Op(off_spec, '', this.id));
    }
};

/** new Type()  in multihost env it may be safer to use Host.get() or,
  * at least, new Type(id, host) / new Type(somevalue, host) */
Logics.prototype.get = function (spec, callback) {
    if (spec && spec.constructor === Function && spec.prototype._type) {
        spec = '/' + spec.prototype._type;
    }
    spec = new Spec(spec);
    var typeid = spec.filter('/#');
    if (!typeid.has('/')) {
        throw new Error('typeless spec');
    }
    var o = typeid.has('#') && this.syncables[typeid];
    if (!o) {
        var t = Syncable.types[spec.type()];
        if (!t) {
            throw new Error('type unknown: ' + spec);
        }
        o = new t(typeid, this.host);
    }
    return o;
};
