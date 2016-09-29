"use strict";
let swarm = require('swarm-protocol');
let Base64x64 = swarm.Base64x64;
let Stamp = swarm.Stamp;
let Spec = swarm.Spec;
let Op = swarm.Op;
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
     * @param {String} state - the state to init a new object with
     *            ('' for the type's default state, null for "not retrieved yet")
     */
    constructor (state) {
        super();

        if (state===undefined)
            state = ''; // new object in the default state

        /** The id of an object is typically the timestamp of the first
         operation. Still, it can be any Base64 string (see swarm-stamp). */
        this._id = Stamp.zero; // string, not stamp (it's cheaper this way)
        /** The RDT inner state */
        this._state = state===null ? null : new this.constructor.RDT(state);
        /** the clock to stamp ops with */
        this._clock = null;
        /** Timestamp of the last change op. Transcendent stamps are used
         *  for detached objects. */
        this._version = Stamp.zero;
        /** Cached "/type#id" string key */
        this._typeid = null;

        if (state!==null && Syncable.defaultHost) {
            Syncable.defaultHost.addNewSyncable(this);
        }
    }

    static setDefaultHost (host) {
        Syncable.defaultHost = host;
    }

    noop () {
        this._submit("0", "", this);
    }

    /** Create, apply and emit a new op.
     * @param {String} op_name - the operation name (Base64x64, transcendent) 
     * @param {String} op_value - the op value */
    _submit (op_name, op_value) {
        if (!this._clock && this.id!=='0')
            throw new Error('stateful obj, no clock');
        let stamp = this._clock ? this._clock.issueTimestamp() : Base64x64.inc(this._version);
        if (!op_name) {
            op_name = '~';
            op_value = this.state;
        }
        let spec = new Spec([
            this.type,
            this._id==='0' && this._clock ? stamp : this._id,
            stamp,
            op_name
        ]);
        let op = new Op(spec, op_value);
        this.offer(op);
    }

    /** Apply an op to the object's state.
      * @param {Op} op - the op */
    offer (op) {
        if (this._id==='0') {
            this._id = op.spec.id;
            this._typeid = null;
        } else if ( this._id !== op.id ) {
            throw new Error('not my op');
        }
        if (op.spec.method===Op.METHOD_STATE) {
            this._state = new this.constructor.RDT(op.value);
        } else {
            if (!this._state) {
                let default_state = new Op(op.spec.rename('~'), '');
                this.offer(default_state);
            }
            this._state.apply(op);
        }
        this._rebuild(op);
        if (!op.isOnOff())
            this._version = op.spec.stamp; // after the rebuild!
        if (!op.spec.Stamp.isTranscendent()) // dry run ops are not emitted
            this._emit(op);
    }

    _rebuild (op) {}

    get id () {
        return this._id;
    }

    get Id () {
        return new Stamp(this._id);
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
        return this._version;
    }

    get Version () {
        return new Stamp(this._version);
    }

    get author () {
        return this.Id.origin;
    }

    /** Syncable type name
     *  @returns {String} */
    get type () {
        return this.constructor.id;
    }

    /** @returns {Stamp} - the object's type with all the type parameters */
    get Type () {
        // TODO type parameters
        return new Stamp(this.type, '0');
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

    get state () {
        return this._state===null ? null : this._state.toString();
    }

    get spec () {
        return new Spec([
            this.type, this._id, this._version, Op.STATE
        ]);
    }

    close () {
        this._emit(null);
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

    /** fires once the object gets some state */
    onceReady (callback) {
        if (this._version!=='0')
            callback();
        else
            super.once(callback);
    }

    clone () {
        return new this.constructor(this._state.clone(), null);
    }

    /** Returns a subscription op for this object */
    toOnOff (is_on) {
        let name = is_on ? Op.ON : Op.OFF;
        let spec = new Spec([this.type, this._id, this._version, name]);
        return new Op(spec, '');
    }

    toOp () {
        let spec = new Spec([this.type, this._id, this._version, Op.METHOD_STATE]);
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

/** Abstract base class for all replicated data types; not an OpStream
 *  RDT is a reducer:  (state_string, op) -> new_state_string
 */
class RDT {

    /**
     * @param {String} state - the serialized state string
     */
    constructor (state) {
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

    /**
     * @returns {String} - the serialized state string 
     */
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
