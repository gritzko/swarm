"use strict";
const RON = require('swarm-ron');
const IS = RON.FN.IS;
const Op = RON.Op;
const Frame = RON.Frame;
const UUID = require('swarm-ron-uuid');
const Cursor = Op.Frame.Cursor;
const Stream = Op.Stream;

/**
 *
 * @param old_state_frame {Cursor}
 * @param change_frame {Cursor}
 * @param new_state_frame {Op.Frame}
 * @private
 */
function log_reduce (old_state_frame, change_frame, new_state_frame) {
    if (old_state_frame.op.isHeader())
        old_state_frame.nextOp();
    if (change_frame.op.isHeader())
        change_frame.nextOp();
    while (old_state_frame.op) {
        new_state_frame.push(old_state_frame.op);
        old_state_frame.nextOp();
    }
    while (change_frame.op) {
        new_state_frame.push(change_frame.op);
        change_frame.nextOp();
    }
}

log_reduce.TYPE_UUID = UUID.fromString("log");
RON.FN.RDT[log_reduce.TYPE_UUID] = log_reduce;
log_reduce.IS = IS.OP_BASED|IS.PATCH_BASED|IS.OMNIVOROUS;

/**
 * Last-write-wins reducer.
 * @return {Frame}
 * @param old_state {Cursor}
 * @param change {Cursor}
 * @param new_state {Frame}
 */
function lww_reduce (old_state, change, new_state) {
    const o = old_state;
    const c = change;
    if (o.op.isHeader()) o.nextOp();
    if (c.op.isHeader()) c.nextOp();
    const changes = Object.create(null);
    const locs = [];
    while (c.op) { // FIXME next
        const loc = c.op.location;
        changes[loc] = c.op;
        locs.push(loc);
        c.nextOp(); // FIXME iteration
    }
    while (o.op) {
        const loc = o.op.location.toString();
        if (loc in changes) {
            if (changes[loc].event.le(o.op.event)) {
                delete changes[loc];
                new_state.push(o.op);
            }
        } else {
            new_state.push(o.op);
        }
        o.nextOp();
    }
    locs.forEach(loc=> (loc in changes) && new_state.push(changes[loc]));
    return new_state;

}
lww_reduce.TYPE_UUID = UUID.fromString("lww");
RON.FN.RDT[lww_reduce.TYPE_UUID] = lww_reduce;
lww_reduce.IS = IS.OP_BASED|IS.PATCH_BASED|IS.STATE_BASED|IS.VV_DIFF;

module.exports = lww_reduce;
