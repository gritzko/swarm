"use strict";
var swarm = require('swarm-protocol');
var Stamp = swarm.Stamp;
var Spec = swarm.Spec;
var Op = swarm.Op;
//var Host = require('./Host');
let OpStream = require('./OpStream');

/**
 * Swarm objects are split into two orthogonal parts, kind of Jekyll and Hyde.
 * The inner state is a cleanroom math-only RDT implementation.
 * It is entirely passive and perfectly serializable.
 * RDT travels on the wire, gets saved into the DB, etc.
 * The outer state (Syncable) is a "regular" JavaScript object which
 * is exposed in the API. A Syncable is a mere projection of its RDT.
 * Still, all mutations originate at a Syncable. This architecture is
 * very similar to MVC, where Syncable is a "View", RDT is a "Model"
 * and the Host is a "Controller".
 */
class Syncable extends OpStream {

  /**
    * @constructor
    * @param {Spec|Stamp|String} spec_stamp_state - the object's typeid (Spec) or
    *       simply the id (Stamp) or a state string to init a new object
    *       ('' for the type's default state)
    * @param {Host} host - the host to attach to (default Host.defaultHost)
    */
    constructor (spec_stamp_state, host) {
        super();

        if (spec_stamp_state && typeof(spec_stamp_state.addSyncable)==='function') {
          host = spec_stamp_state;
          spec_stamp_state = '';
        }
        if (host===undefined && !Syncable.multiHost) {
          host = Syncable.defaultHost;
        }
        if (!spec_stamp_state)
            spec_stamp_state = '';

        /** The id of an object is typically the timestamp of the first
         operation. Still, it can be any Base64 string (see swarm-stamp). */
        this._id = null;
        this._state = null;
        this._host = null;
        /** Timestamp of the last change op. */
        this._version = Stamp.ZERO;
        this._typeid = null;

        if (spec_stamp_state.constructor===Spec) {
            let spec = spec_stamp_state;
            if (!spec.Type.eq(this.type))
                throw new Error("wrong type");
            if (host) // avoid creating a duplicate object
                return host.addSyncable(this, spec.Id);
        } else if (spec_stamp_state.constructor===Stamp) {
            if (host) // avoid creating a duplicate object
                return host.addSyncable(this, spec_stamp_state);
        } else if (spec_stamp_state.constructor===String) {
            host.addSyncable(this, Stamp.ZERO, spec_stamp_state);
        }

    }

    noop () {
        this._submit("0", "", this);
    }

    _submit (op_name, op_value) {
        if (this._id!==null && this._state===null) {
            throw new Error("can not write to a stateless object");
        }
        if (this._host===null) {
            throw new Error("can not write to an orphan object");
        }
        this._host._submit(op_name, op_value, this);
    }

    offer (op) {
        if (op.name==='~') {
            this._state = new this.constructor.RDT(op);
            this._id = op.spec.Id;
            this._typeid = null;
        } else if (this._state) {
            this._state.apply(op);
        } else if (op.isOn()) {
            let default_state = new Op(op.spec.rename('~'), '');
            this.offer(default_state);
        } else {
            console.warn('op applied to a stateless object', op.toString());
        }
        this._rebuild(op);
        this._version = op.spec.Stamp; // after the rebuild!
        this._emit(op);
    }

    _rebuild (op) {}

    get id () {
        return this._id.toString();
    }

    /**
     *  The most correct way to specify a version in a distibuted system
     *  with partial order is a *version vector*. Unfortunately in some
     *  cases, a VVector may consume more space than the data itself.
     *  So, `version()` is not a version vector, but the last applied
     *  operation's timestamp (Lamport-like, i.e. "time+origin").
     *  It changes every time the object changes, but *not* monotonously.
     *  For a stateless object (e.g. the state did not arrive from the
     *  server yet), `o.version()==='0'`. Deleted objects (no further
     *  writes possible) have `o.version()==='~'`. For a normal stateful
     *  object, version is the timestamp of the last op applied, according
     *  to the local order (in other replicas, the order may differ).
     */
    get version () {
        return this._version.toString();
    }

    get Version () {
        return this._version;
    }

    get author () {
        return this._id.origin;
    }

    /** Syncable type name
     *  @returns {String} */
    get type () {
        return this.constructor.id;
    }

    /** @returns {Stamp} - the object's type with all the type parameters */
    get Type () {
        // TODO
    }

    get host () {
        return this._host;
    }
    /** Objects created by supplying an id need  to query the upstream
     *  for their state first. Until the state arrives, they are
     *  stateless. Use `obj.once(callback)` to get notified of state arrival.
     */
    hasState () {
        return this._state !== null;
    }

    get spec () {
        return new Spec([
            this.type, this._id, this._version, Op.STATE
        ]);
    }

    close () {
        this._host && this._host.removeSyncable(this);
    }

    get typeid () {
        if (null===this._typeid) {
            this._typeid = this.TypeId.toString(Spec.ZERO);
        }
        return this._typeid;
    }

    get TypeId () {
        return new Spec([this.type, this._id, Stamp.ZERO, Stamp.ZERO]);
    }

    /** Invoke a listener after applying an op of this name
     *  @param {String} op_name - name of the op
     *  @param {Function} callback - listener */
    onOp (op_name, callback) {
        this.on('.'+op_name, callback);
    }

    /** fires once the upstream returns a handshake */
    onceReady (callback) {
        if (!this._version.isZero())
            callback();
        else
            super.once(callback);
    }

    clone () {
        return new this.constructor(this._state.clone(), null);
    }

    /** Returns a subscription op for this object */
    get subscription () {
        let spec = new Spec([this.type, this._id, this._version, Op.ON]);
        return new Op(spec, '');
    }

    toOp () {
        let spec = new Spec([this.type, this._id, this._version, Op.STATE]);
        return new Op(spec, this._state.toString());
    }

    toString () {
        return this._state && this._state.toString();
    }

}

Syncable._classes = Object.create(null);
Syncable._classes.Syncable = Syncable;
Syncable.id = "Syncable";

Syncable.multiHost = false;
Syncable.defaultHost = null;

module.exports = Syncable;

/** Abstract base class for all replicated data types; not an OpStream */
class RDT {

    constructor (state_op) {
    }

    apply (op) {
        switch (op.name) {
            case "0":    this.noop(); break;
            case "on":   break;
            default:     console.warn("unknown op", op.toString()); break;
        }
    }

    noop () {
    }

    toString () {
        return "";
    }

    clone () {
        return new this.constructor(this.toString());
    }

}
Syncable.RDT = RDT;

// ----8<----------------------------

/* A *reaction* is a hybrid of a listener and a method. It "reacts" on a
// certain event for all objects of that type. The callback gets invoked
// as a method, i.e. this===syncableObj. In an event-oriented architecture
// reactions are rather handy, e.g. for creating mixins.
// @param {string} op operation name
// @param {function} fn callback
// @returns {{op:string, fn:function}}
Syncable.addReaction = function (op, fn) {
...
};
TODO this needs further refinement; in the current arch, useless as it is
*/
