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
        this._upstream = null;
    }


    create (class_fn, args) {
        const template_frame = class_fn.create(args);
        const frame = this.sendFrame(template_frame);
        const rdt = new class_fn(this);
        rdt.update(frame, null);
        this._rdts[rdt.id()] = rdt;
        return rdt;
    }

    get (class_fn, uuid) {
        if (uuid in this._rdts)
            return this._rdts[uuid];
        if (uuid in this._states) {
            const rdt = this._rdts[uuid] = new class_fn(this);
            rdt.update(this._states[uuid], null);
            return rdt;
        }
        // else subscribe
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
                const state_frame = c.nextFrame();
                this._states[uuid] = state_frame; // FIXME overwrite? merge?
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
                console.warn("unclear: "+op);
                c.nextOp();
            }
            const rdt = this._rdts[uuid];
            if (rdt) {
                rdt.update(this._states[uuid], op);
            }
        }
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
        if (this._upstream)
            this._upstream.write(changes.toString()+'\n\n');
        return changes;
    }

    unacked_queue () {
        return  Frame.fromArray(this._log);
    }

    connect (upstream) {
        // TODO unsub/ sub, sub modes
        this._upstream = upstream;
        upstream.on('data',
            data => this.receiveFrame(Frame.as(data)));
        // TODO err/ disconn/ reconn
    }

}

Host.UUID_FILL_IN = UUID.as("0-~");

module.exports = Host;