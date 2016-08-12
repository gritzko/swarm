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
 * @constructor
 * @param {Op|Stamp|String} op_id_nothing - init data, id or state
 * @param {Host} host - the host to attach to (default Host.defaultHost)
 */
class Syncable extends OpStream {

    constructor (op_id_nothing, host) {
        super();
        /** The id of an object is typically the timestamp of the first
         operation. Still, it can be any Base64 string (see swarm-stamp). */
        this._id = Stamp.ZERO;
        this._rdt = null;
        this._host = null;
        /** Timestamp of the last change op. */
        this._version = Stamp.ZERO;
        this._typeid = null;

        if (!op_id_nothing) {
        } else if (op_id_nothing.addSyncable) { // Host
            host = op_id_nothing;
            this._submit("~", "");
        } else if (op_id_nothing.constructor===Op) {
            let op = op_id_nothing;
            if (!op.isState())
                throw new Error("not a state");
            if ( op.spec.Type.value !== this.type )
                throw new Error("wrong type");
            this.offer(op);
        } else if (op_id_nothing.constructor===Spec) {
            let spec = op_id_nothing;
            if (!spec.Type.eq(this.type))
                throw new Error("wrong type");
            this._id = spec.Id;
        } else if (op_id_nothing.constructor===Stamp) {
            this._id = op_id_nothing;
        } else if (op_id_nothing.constructor===String) {
            this._id = new Stamp(op_id_nothing);
        }

        if (host===undefined && !Syncable.multiHost) {
            host = Syncable.defaultHost;
        }
        if (host) {
            // refuse to create a duplicate object
            return host.addSyncable(this);
        }
    }

    noop () {
        this._submit("0", "", this);
    }

    _submit (op_name, op_value) {
        if (this._rdt===null) {
            throw new Error("can not write to a stateless object");
        }
        if (this._host===null) {
            throw new Error("can not write to an orphan object");
        }
        this._host.submit(op_name, op_value, this);
    }

    offer (op) {
        if (op.name==='~') {
            this._rdt = new this._type_rdt_class(op);
            this._id = op.spec.Id;
            this._typeid = null;
        } else {
            this._rdt.apply(op);
        }
        this._version = op.spec.Stamp;
        this._emit(op);
    }

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

    get _type_rdt_class () {
        return this.constructor._rdt;
    }

    get host () {
        return this._host;
    }
    /** Objects created by supplying an id need  to query the upstream
     *  for their state first. Until the state arrives, they are
     *  stateless. Use `obj.once(callback)` to get notified of state arrival.
     */
    hasState () {
        return this._rdt !== null;
    }

    get spec () {
        return new Spec([
            this.type(), this._id, this._version, Op.STATE
        ]);
    }

    close () {
        this._host && this._host.removeSyncable(this);
    }

    get typeid () {
        if (null===this._typeid) {
            let spec = new Spec([this.type, this.id, Stamp.ZERO, Stamp.ZERO]);
            this._typeid = spec.toString(Spec.ZERO);
        }
        return this._typeid;
    }

    /** Invoke a listener after applying an op of this name
     *  @param {String} op_name - name of the op
     *  @param {Function} callback - listener */
    onOp (op_name, callback) {
        this.on('.'+op_name, callback);
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
            case "noop": this.noop(); break;
            default:     break;
        }
    }

    noop () {
        // nothing :)
    }

    toString () {
        return "";
    }

}
Syncable._rdt = RDT;

// ----8<----------------------------

/*
Syncable.prototype.save = function () {
    var host = this.ownerHost();
    var clean_state = host.getCRDT().updateSyncable({});
    var diff = this.diff(clean_state);
    while (diff && diff.length) {
        host.submitOp(this, diff.unshift());
    } TODO
};
*/

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
