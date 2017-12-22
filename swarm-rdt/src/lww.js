// @flow
'use strict';

import Op, {Frame, Cursor, UUID} from 'swarm-ron';
import {IS_OP_BASED, IS_PATCH_BASED, IS_STATE_BASED, IS_VV_DIFF} from './is';

/**
 * Last-write-wins reducer.
 * @param state {Cursor}
 * @param d {Cursor}
 * @param ret {Frame}
 */
export default function reduce(state: Cursor, d: Cursor, ret: Frame) {
  if (state.op && state.op.isHeader()) state.nextOp();
  if (d.op && d.op.isHeader()) d.nextOp();

  while (state.op && d.op) {
    if (state.op.location.eq(d.op.location)) {
      if (state.op && d.op) {
        ret.push(
          state.op.event && state.op.event.ge(d.op.event) ? state.op : d.op,
        );
      }
      state.nextOp();
      d.nextOp();
    } else if (state.op && d.op && state.op.location.gt(d.op.location)) {
      ret.push(d.op);
      d.nextOp();
    } else {
      if (state.op != null) ret.push(state.op);
      state.nextOp();
    }
  }

  for (; state.op; state.nextOp()) ret.push(state.op);
  for (; d.op; d.nextOp()) ret.push(d.op);
}

export const TYPE_UUID = UUID.fromString('lww');
export const IS = IS_OP_BASED | IS_PATCH_BASED | IS_STATE_BASED | IS_VV_DIFF;
