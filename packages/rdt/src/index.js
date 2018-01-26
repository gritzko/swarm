// @flow
'use strict';

import Op, {Batch, Frame, FRAME_SEP} from 'swarm-ron';
import UUID, {ZERO} from 'swarm-ron-uuid';

import lww from './lww';
import log from './log';
import set from './set';

const rdt: {[string]: {|type: UUID, reduce: Batch => Frame|}} = {
  lww,
  log,
  set,
};

function empty(batch: Batch): Frame {
  const ret = new Frame();
  for (const first of batch.frames) {
    for (const op of first) {
      let loc = op.uuid(3);
      if (!op.isHeader()) loc = op.uuid(2);
      ret.push(
        new Op(
          op.uuid(0),
          op.uuid(1),
          // $FlowFixMe
          batch.frames[batch.length - 1][Symbol.iterator]().op.event,
          loc,
          undefined,
          FRAME_SEP,
        ),
      );
      return ret;
    }
  }
  return ret;
}

// Reduce picks a reducer function, performs all the sanity checks,
// invokes the reducer, returns the result
export function reduce(batch: Batch): Frame {
  let type = ZERO;
  for (const first of batch.frames) {
    for (const op of first) {
      type = op.type;
      break;
    }
    break;
  }

  if (rdt[type.toString()]) {
    return rdt[type.toString()].reduce(batch);
  }
  return empty(batch);
}

export {default as lww} from './lww';
export {default as log} from './log';
export {default as set} from './set';
