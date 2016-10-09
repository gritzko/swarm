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
     * @param {RDT} rdt - the state to init a new object with
     * @param {Function} callback - callback to invoke once the object is stateful
     */
    constructor (rdt, callback) {
        super();

        /** The RDT inner state */
        this._rdt = rdt;
        rdt.on(this);
        this._rebuild();

        if (callback)
            this.once(callback); // FIXME

    }

    /** @returns {Client} host */
    get host () {
        return this._rdt._host;
    }

    noop () {
        this._submit("0", "");
    }

    /** Create, apply and emit a new op.
     * @param {String} op_name - the operation name (Base64x64, transcendent) 
     * @param {String} op_value - the op value */
    _offer (op_name, op_value) { // FIXME BAD!!!
        const stamp = this._rdt._host.time();
        const op = new Op([this.Type, this.Id, stamp, new Stamp(op_name)], op_value);
        this._rdt.offer(op);
    }

    /** Apply an op to the object's state.
      * @param {Op} op - the op */
    _apply (op) {
        this._rebuild(op);
        this._emit(op);
    }

    _rebuild (op) {

    }

    get id () {
        return this.Id.toString();
    }

    get Id () {
        return this._rdt.Id;
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
        return this.Version.toString();
    }

    /** @returns {Stamp} */
    get Version () {
        return this._rdt.Version;
    }

    get author () {
        return this.Id.origin;
    }

    /** Syncable type name
     *  @returns {String} */
    get type () {
        return this.Type.toString();
    }

    get clazz () {
        return this.constructor.RDT.Type.value;
    }

    /** @returns {Stamp} - the object's type with all the type parameters */
    get Type () {
        return this._rdt.Type;
    }

    /** Objects created by supplying an id need  to query the upstream
     *  for their state first. Until the state arrives, they are
     *  stateless. Use `obj.once(callback)` to get notified of state arrival.
     */
    hasState () {
        return !this.Version.isZero();
    }

    get spec () {
        return new Spec([
            this.Type, this.Id, this.Version, Op.STATE
        ]);
    }

    close () {
        this._rdt.off(this); // FIXME OpStream listener
        this._rdt = null;
    }

    get typeid () {
        return this.TypeId.toString(Spec.ZERO);
    }

    get TypeId () {
        return new Spec([this.Type, this.Id, Stamp.ZERO, Stamp.ZERO]);
    }

    /** Invoke a listener after applying an op of this name
     *  @param {String} op_name - name of the op
     *  @param {Function} callback - listener */
    // onOp (op_name, callback) {
    //     this.on('.'+op_name, callback);
    // }

    /** fires once the object gets some state */
    onceStateful (callback) {
         if (!this.Version.isZero())
             callback();
         else
             super.once(callback);
    }

    onceSync (callback) {
        super.on(function (op) { // FIXME catch reon
            if (op.isOn()) {
                callback (op);
                return OpStream.ENOUGH;
            }
            return OpStream.OK;
        });
    }

    toString () {
        return this.toOp().toString();
    }

    static addClass (fn) {
        Syncable._classes[fn.RDT.Type.value] = fn;
    }

    /** @param {Stamp|String|Base64x64} type */
    static getClass (type) {
        const Type = new Stamp(type);
        return Syncable._classes[Type.value];
    }

    static getRDTClass (type) {
        return Syncable.getClass(type).RDT;
    }

}

/** Abstract base class for all replicated data types; not an OpStream
 *  RDT is a reducer:  (state, op) -> new_state
 */
class RDT extends OpStream {

    /**
     * @param {Op} state - the serialized state
     * @param {Client} host
     */
    constructor (state, host) {
        super();
        /** The id of an object is typically the timestamp of the first
         operation. Still, it can be any Base64 string (see swarm-stamp). */
        this._id = state.Id;
        this._host = host;
        /** Timestamp of the last change op. */
        this._version = null;
        this._apply(state);
    }

    offer (op) {
        this._apply(op);
        if (this._host)
            this._host.offer(op);
    }

    _apply (op) {
        switch (op.method) {
            case "0":
                this.noop();
                this._version = op.Stamp;
                break;
            case "~":
                this.reset(op);
                this._version = op.Stamp;
                break;
            case "off":  break;
            case "on":
                if (op.Stamp.isZero() && !this.Version.isZero())
                    this._host.offer(this.toOp());
                break;
            default:
                this._version = op.Stamp;
                break;
        }
        this._emit(op);
    }

    noop () {
    }

    reset (op) {
    }

    get Type () {
        return this.constructor.Type;
    }

    get Version () {
        return this._version;
    }

    get Id () {
        return this._id;
    }

    /**
     * @returns {String} - the serialized state string 
     */
    toString () {
        return "";
    }

    /** Returns a subscription op for this object */
    toOnOff (is_on) {
        let name = is_on ? Op.STAMP_ON : Op.STAMP_OFF;
        let spec = new Spec([this.Type, this.Id, this.Version, name]);
        return new Op(spec, '');
    }

    toOp () {
        return new Op([
            this.Type,
            this._id,
            this._version,
            Op.STAMP_STATE
        ], this.toString());
    }

    clone () {
        return new this.constructor(this.toOp());
    }

}
Syncable.RDT = RDT;
Syncable.RDT.Type = new Stamp("Syncable"); // FIXME TYPE

Syncable._classes = Object.create(null);
Syncable.defaultHost = null;

Syncable.addClass(Syncable);

module.exports = Syncable;

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
