// @flow
'use strict';

import Op, {
  UUID_ERROR as ERROR,
  Cursor,
  Frame,
  FRAME_SEP,
  UUID,
} from 'swarm-ron';

import {IS_OP_BASED, IS_STATE_BASED, IS_OMNIVOROUS} from './is';
import * as log from './log';
import * as lww from './lww';

const rdt: {
  [string]: {|
    TYPE_UUID: UUID,
    IS: number,
    default: (Cursor, Cursor, Frame) => void,
  |},
} = {
  lww,
  log,
};

export default rdt;

/***
 *
 * @param oldStateFrame {String}
 * @param changeFrame {String}
 * @return {String}
 */
export function reduce(oldStateFrame: string, changeFrame: string): string {
  const oi = new Cursor(oldStateFrame);
  const ai = new Cursor(changeFrame);

  let features: number = 0;
  let _reduce;
  let error;

  if (oi.op != null) {
    const _rdt = rdt[oi.op.type];
    if (_rdt) {
      _reduce = _rdt.default;
      features = _rdt.IS;
    }
  }

  if (!_reduce) {
    error = '>NOTYPE';
  } else if ((oi.op && oi.op.isQuery()) || (ai.op && ai.op.isQuery())) {
    error = '>NOQUERY';
  } else if (
    0 === (features & IS_OP_BASED) &&
    (oi.op.isRegular() || ai.op.isRegular())
  ) {
    error = '>NOOPBASED';
  } else if (0 === (features & IS_STATE_BASED) && ai.op && ai.op.isHeader()) {
    error = '>NOSTATBASD';
  } else if (
    0 === (features & IS_OMNIVOROUS) &&
    ai.op &&
    oi.op &&
    !oi.op.type.eq(ai.op.type)
  ) {
    error = '>NOOMNIVORS';
  } else if (ai.op && ai.op.isError()) {
    error = '>ERROR'; // TODO fetch msg
  }
  const newFrame = new Frame();
  if (!error && oi.op && ai.op) {
    newFrame.push(
      new Op(
        oi.op.type,
        oi.op.object,
        ai.op.event,
        oi.op.isHeader() ? oi.op.location : oi.op.event,
        FRAME_SEP,
      ),
    );
    if (_reduce) _reduce(oi, ai, newFrame);
  }
  if (error && oi.op && ai.op) {
    return new Op(
      oi.op.type,
      oi.op.object,
      ERROR,
      ai.op.event,
      error,
    ).toString();
  } else {
    return newFrame.toString();
  }
}
