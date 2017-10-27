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
 * @param state {Cursor} -- the state frame
 * @param d {Cursor} -- the change op/frame
 * @param ret {Frame} -- the resulting (reduced) state frame
 */
function lww_reduce (state, d, ret) {

    if (state.op.isHeader()) state.nextOp();
    if (d.op.isHeader()) d.nextOp();

    while (state.op && d.op) {
        if (state.op.location.eq(d.op.location)) {
            ret.push(state.op.event.ge(d.op.event)?state.op:d.op);
            state.nextOp();
            d.nextOp();
        } else if (state.op.location.gt(d.op.location)) {
            ret.push(d.op);
            d.nextOp();
        } else {
            ret.push(state.op);
            state.nextOp();
        }
    }
    for (; state.op; state.nextOp())
        ret.push(state.op);
    for(; d.op; d.nextOp())
        ret.push(d.op);

    return ret;

}
lww_reduce.TYPE_UUID = UUID.fromString("lww");
RON.FN.RDT[lww_reduce.TYPE_UUID] = lww_reduce;
lww_reduce.IS = IS.OP_BASED|IS.PATCH_BASED|IS.STATE_BASED|IS.VV_DIFF;

module.exports = lww_reduce;
