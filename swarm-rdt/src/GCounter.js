"use strict";
const RON = require("swarm-ron");
const RDT = require("./RDT");
const UUID = RON.UUID;
const Op = RON.Op;
const Frame = RON.Frame;

class GCounter extends RDT {

    constructor (host) {
        super(host);
        this._value = 0;
    }

    _update (new_state_i, changes_i) {
        const state_op = new_state_i.next().value;
        if (!state_op) {
            this._value = 0;
        } else if (state_op.isError() || !state_op.Location.eq(GCounter.SUM_UUID)) {
            this._value = NaN;
        } else {
            this._value = state_op.value(0);
        }
    }

    static reduce (old_state_i, change_frame_i, new_state_frame) {
        const old = old_state_i.next();
        let sum = old.done ? 0 : old.value.value(0);
        if (!Number.isInteger(sum))
            return "malformed state";
        for(let op of change_frame_i) {
            const add = op.value(0);
            if (!Number.isInteger(add))
                return "malformed increment";
            sum += add;
            if (sum>Number.MAX_SAFE_INTEGER)
                return "overflow";
        }
        new_state_frame.push(null, null, null, GCounter.SUM_UUID, sum);
    }

}

GCounter.SUM_UUID = new UUID();

module.exports = GCounter;