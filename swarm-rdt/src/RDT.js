"use strict";
const RON = require('swarm-ron');
const UUID = RON.UUID;
const Op = RON.Op;
const Frame = RON.Frame;
const Iterator = Frame.Iterator;
const EventEmitter = require('events');

/**
 * Swarm objects are split into two orthogonal parts, kind of Jekyll and Hyde.
 * The inner state is a cleanroom math-only RON frame.
 * It is entirely passive and perfectly serializable.
 * RON travels on the wire, gets saved into the DB, etc.
 * The outer state (RDT) is a "regular" JavaScript object with an API.
 * An RDT is a mere projection of its RON state.
 * RDT hosts a static (pure) reducer:  (state-frame, change_frame) -> new_state_frame
 */
class RDT extends EventEmitter {

    constructor (host) {
        super();
        this._id = UUID.ZERO;
        this._version = UUID.ZERO;
        this._host = host || null;
    }

    Type () {
        return this.constructor.TYPE_UUID;
    }

    update (new_state_frame, change_frame) {
        const state_i = Frame.Iterator.as(new_state_frame);
        const change_i = Frame.Iterator.as(change_frame);

        if (state_i.op.isError()) {
            this._version = UUID.ERROR;
            return;
        }
        if (this._id.isZero())
            this._id = state_i.op.object;
        state_i.nextOp();

        this._update(state_i, change_i);

        this._version = state_i.op.event;
        this.emit("change");
    }

    submit (loc, value) {
        if (!this._host)
            throw new Error("no host - not writable");
        if (this._id.isZero())
            throw new Error("no state - not writeable");
        const changes = new Frame();
        changes.push( new Op(
            this.Type(),
            this.Id(),
            UUID.as('1-~'),
            UUID.fromString(loc),
            Op.js2ron(value)
        ));
        this._host.sendFrame (changes);
    }

    _update (frame, op) {
        // _inner methods trust their arguments
        // noop
    }

    static reduce (old_state_frame, change_frame, new_state_frame) {
        const old = Iterator.as(old_state_frame);
        const add = Iterator.as(change_frame);
        const neu = Frame.as(new_state_frame||'');
        const type = RDT.TYPES[old.op.type];
        // first, sanity checks
        let error;
        const feat = type.REDUCER_FEATURES;
        if (!type) {
            error = "unknown type";
        } else if (old.op.isQuery() || add.op.isQuery()) {
            error = "misplaced query";
        } else if (0===(feat&RDT.FLAGS.OMNIVOROUS) && !old.op.type.eq(add.op.type)) {
            error = "mismatching type";
        } else if (0===(feat&RDT.FLAGS.OP_BASED) && (old.op.isPlain() || add.op.isPlain())) {
            error = "no op-based";
        } else if (0===(feat&RDT.FLAGS.STATE_BASED) && add.op.isState()) {
            error = "no state-based";
        } else if (add.op.isError()) {
            error = "error: " + add.op.value(0);
        }
        if (error) {
            neu.push(new Op(old.op.type, old.op.object, UUID.ERROR, [add.op.event, error]));
            return neu;
        }
        // deal with headers
        const header = new Op(
            old.op.type,
            old.op.object,
            add.op.event,
            old.op.location,
            [Op.FRAME_SEP]
        );
        neu.push(header);

        if (!old.op.isPlain())
            old.nextOp();
        if (!add.op.isPlain())
            add.nextOp();

        type._reduce(old, add, neu); // FIXME errors!!!!!!!!!!

        return neu;
    }

    static _reduce (old_state_frame, change_frame, new_state_frame) {
        while (!change_frame.end()) {
            new_state_frame.push(change_frame.op);
            change_frame.nextOp();
        }
    }

    /** a shortcut */
    static create (args) {
        throw new Error("not implemented");
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
    Version () {
        return this._version;
    }

    Id () {
        return this._id;
    }

    type () {
        return this.Type().toString();
    }

    version () {
        return this._version.toString();
    }

    id () {
        return this._id.toString();
    }

    hasIdentity () {
        return !this._id.isZero();
    }

    hasState () {
        return !this._version.isZero();
    }

    /**
     * @returns {String} - the serialized state string
     */
    toString () {
        return JSON.stringify(this, (key, value) => key!=="_host");
    }

}


RDT.TYPE_UUID = UUID.ZERO;
RDT.FLAGS = {
    OP_BASED: 1,
    STATE_BASED: 2,
    PATCH_BASED: 4,
    VV_DIFF: 8,
    OMNIVOROUS: 16,
};
RDT.REDUCER_FEATURES =
    RDT.FLAGS.OP_BASED |
    RDT.FLAGS.PATCH_BASED |
    RDT.FLAGS.OMNIVOROUS;
RDT.TYPES = Object.create(null);
RDT.TYPES[RDT.TYPE_UUID] = RDT;

module.exports = RDT;

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
*/
