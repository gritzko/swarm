// @flow
'use strict';

import Op, {UUID_ERROR as ERROR, Cursor, Frame, FRAME_SEP, UUID} from 'swarm-ron';

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
  const oi = new Cursor(oldStateFrame).op;
  const ai = new Cursor(changeFrame).op;

  let features: number = 0;
  let _reduce;
  let error;

  if (oi != null) {
    const _rdt = rdt[oi.type.toString()];
    if (_rdt) {
      _reduce = _rdt.default;
      features = _rdt.IS;
    }
  }

  if (!_reduce) {
    error = '>NOTYPE';
  } else if ((oi && oi.isQuery()) || (ai && ai.isQuery())) {
    error = '>NOQUERY';
  } else if (0 === (features & IS_OP_BASED) && ((oi && oi.isRegular()) || (ai && ai.isRegular()))) {
    error = '>NOOPBASED';
  } else if (0 === (features & IS_STATE_BASED) && ai && ai.isHeader()) {
    error = '>NOSTATBASD';
  } else if (0 === (features & IS_OMNIVOROUS) && ai && oi && !oi.type.eq(ai.type)) {
    error = '>NOOMNIVORS';
  } else if (ai && ai.isError()) {
    error = '>ERROR'; // TODO fetch msg
  }
  const newFrame = new Frame();
  if (!error && oi && ai) {
    newFrame.push(new Op(oi.type, oi.object, ai.event, oi.isHeader() ? oi.location : oi.event, FRAME_SEP));
    if (_reduce) _reduce(new Cursor(oldStateFrame), new Cursor(changeFrame), newFrame);
  }
  if (error && oi && ai) {
    return new Op(oi.type, oi.object, ERROR, ai.event, error).toString();
  } else {
    return newFrame.toString();
  }
}
