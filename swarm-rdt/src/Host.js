"use strict";
const RON = require('swarm-ron');
const UUID = RON.UUID;
const Frame = RON.Frame;

/** A local-only RDT host mostly useful for testing */
class LocalHost {

    constructor (replica_id) {
        this._clock = new RON.Clock(RON.Base64x64.fromString(replica_id));
        this._states = Object.create(null); // { id : frame_string }
        this._rdts = Object.create(null);
        this._log = [];
    }


    createObject (class_fn, args) {
        const template_frame = class_fn.create(args);
        const frame = this.sendFrame(template_frame);
        const rdt = new class_fn(this);
        rdt._write(frame);
        this._rdts[rdt.id()] = rdt;
    }

    getObject (uuid) {
        return this._rdts[uuid];
    }

    getState (uuid) {
        return this._states[uuid];
    }

    receiveFrame (change_frame) {
        const frames = change_frame.split();
        frames.forEach( frame => {
            const change = Frame.as(frame);
            const header = change.first();
            const id = header.ObjectUID();
            if (header.isState()) {
                this._states[id] = change; // FIXME toString()
            } else {
                // FIXME filter out echo
                this._states[id] = this._reduce_frame(this._states[id], change);
            }
            const rdt = this._rdts[id];
            if (rdt)
                rdt._update(this._states[id], change);
        });
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

    sendFrame (frame) {
        const changes = new Frame();
        for(let op of frame) {
            this._clock.time();
            // stamp => new ; others use
            // replace id, stamp, loc
            changes.push();
        }
        this._log.push(changes);
        this.receiveFrame (changes);
    }

}

module.exports = LocalHost;