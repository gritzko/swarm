"use strict";
const RON = require('swarm-ron');
const UUID = RON.UUID;
const Frame = RON.Frame;
const Iterator = Frame.Iterator;
const RDT = require('./RDT');

/** A semi-abstract RDT host mostly useful for testing.
 *  See descendant classes for any concrete behavior. */
class Host {

    constructor (clock) {
        this._clock = clock;
        this._states = Object.create(null); // { id : frame_string }
        this._rdts = Object.create(null);
        this._log = [];
    }


    create (class_fn, args) {
        const template_frame = class_fn.create(args);
        const frame = this.sendFrame(template_frame);
        const rdt = new class_fn(this);
        rdt.update(frame, null);
        this._rdts[rdt.id()] = rdt;
        return rdt;
    }

    get (uuid) {
        return this._rdts[uuid];
    }

    getState (uuid) {
        return this._states[uuid];
    }

    receiveFrame (change_frame) {
        const c = Iterator.as(change_frame);
        while (!c.end()) {
            const op = c.op;
            const uuid = op.object;
            if (op.isState()) {
                this._states[uuid] = op; // FIXME overwrite? merge?
                c.nextOp();
            } else if (op.isPlain()) {
                const old = this._states[uuid];
                if (old) {
                    const neu = RDT.reduce(old, c);
                    this._states[uuid] = neu;
                } else {
                    console.warn("unknown: " + op);
                    c.nextOp();
                }
            } else {
                console.warn("unlear: "+op);
                c.nextOp();
            }
            const rdt = this._rdts[uuid];
            if (rdt) {
                rdt.update(this._states[uuid], op);
            }
        }
    }

    _reduce_frame (state_frame, change_frame) {
        const state = Frame.as(new_state_frame);
        const change = Frame.as(change_frame); // could be null

        // TODO other frame sanity checks
        const reduced = new Frame();
        // check headers <<< copy
        const error = type.reduce(state, changes, new_state);
        if (error) {
        }
        rdt.update(new_state, changes);
        return reduced;
    }

    fill (template_uuid, uuids) {
        if (template_uuid.origin!==RON.UUID.never)
            return template_uuid;
        const have = uuids[template_uuid];
        if (have)
            return have;
        return uuids[template_uuid] = this._clock.time();
    }

    sendFrame (frame) {
        const raw = Frame.as(frame);
        const changes = new Frame();
        const stamps = Object.create(null);
        for(let op of raw) {
            const filled = new RON.Op(
                op.type,
                this.fill(op.object, stamps),
                this.fill(op.event, stamps),
                this.fill(op.location, stamps),
                op.raw_values()
            );
            changes.push(filled);
        }
        this._log.push(changes);
        this.receiveFrame (changes);
        return changes;
    }

    unacked_queue () {
        return  Frame.fromArray(this._log);
    }

}

Host.UUID_FILL_IN = UUID.as("0-~");

module.exports = Host;