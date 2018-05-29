// @flow
'use strict';

import Op, {Batch, Frame, FRAME_SEP} from '@swarm/ron';
import UUID, {ZERO} from '@swarm/ron-uuid';
import IHeap, {eventComparatorDesc} from './iheap';

const heap = new IHeap(eventComparatorDesc);

export function reduce(batch: Batch): Frame {
  const ret = new Frame();
  if (!batch.length) return ret;

  for (const frame of batch) {
    if (batch.length === 1) return frame;
    for (const op of frame) {
      const head = new Op(type, op.uuid(1), op.uuid(2), ZERO, undefined, FRAME_SEP);

      const theLastOne = Op.fromString(batch.frames[batch.length - 1].toString());
      if (theLastOne) head.event = theLastOne.event;

      ret.push(head);

      heap.clear();
      heap.put(batch);

      while (!heap.eof()) {
        const current = heap.current();
        if (!current || current.event.sep !== '+') break;
        ret.pushWithTerm(current, ',');
        heap.nextPrim();
      }
      return ret;
    }
  }
  return ret;
}

export const type = UUID.fromString('log');
export default {reduce, type};
