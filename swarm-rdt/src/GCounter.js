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

    value () {
        return this._value;
    }

    add (num) {
        if (!Number.isInteger(num) || num<=0)
            throw new Error("not a positive integer");
        if (num+this._value>Number.MAX_SAFE_INTEGER)
            throw new Error("integer overflow"); // another failure state?
        this.submit("add", num);
    }

    _update (new_state_i, changes_i) {
        const state_op = new_state_i.op;
        if (new_state_i.end()) {
            this._value = 0;
        } else if (state_op.isError() || !state_op.location.eq(GCounter.LOC_SUM_UUID)) {
            this._value = NaN;
        } else {
            this._value = state_op.value(0);
        }
    }

    static _reduce (old_state_i, change_frame_i, new_state_frame) {
        const old = old_state_i.op;
        let sum = old.isError() ? 0 : old.value(0); // TODO error cond tests
        if (!Number.isInteger(sum))
            return "malformed state";
        let last_stamp = old.isError() ? UUID.ZERO : old.event; // FIXME
        while (!change_frame_i.end()) {
            const add = change_frame_i.op.value(0);
            if (!Number.isInteger(add))
                return "malformed increment";
            sum += add;
            if (sum>Number.MAX_SAFE_INTEGER)
                return "overflow";
            last_stamp = change_frame_i.op.event;
            change_frame_i.nextOp();
        }
        new_state_frame.push(new Op(
            new_state_frame._last_op.type,
            new_state_frame._last_op.object,
            last_stamp,
            GCounter.LOC_SUM_UUID,
            Op.js2ron(sum)
        ));
    }

    inc (i) {
        this.submit("inc", i);
    }

    static create (value) {
        const i = Number.isInteger(value) ? value : 0;
        const template = new Frame();
        const stamp = UUID.as("1-~");
        template.push( new Op(GCounter.TYPE_UUID, stamp, stamp, UUID.ZERO, Op.atoms(Op.FRAME_VALUE)) );
        template.push( new Op(GCounter.TYPE_UUID, stamp, stamp, GCounter.LOC_SUM_UUID, Op.atoms(i)) );
        return template;
    }

}

GCounter.TYPE_UUID = UUID.fromString("inc");
GCounter.LOC_SUM_UUID = UUID.fromString("sum");
GCounter.LOC_ADD_UUID = UUID.fromString("add");
RDT.TYPES[GCounter.TYPE_UUID] = GCounter;
GCounter.REDUCER_FEATURES = RDT.FLAGS.OP_BASED|RDT.FLAGS.PATCH_BASED;

module.exports = GCounter;