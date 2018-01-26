// @flow

import Op, {ZERO as ZERO_OP, FRAME_SEP, Batch, Frame, Cursor} from 'swarm-ron';
import UUID, {ZERO} from 'swarm-ron-uuid';
import IHeap, {refComparatorDesc} from './iheap';

const heap = new IHeap(setComparator, refComparatorDesc);
const DELTA = UUID.fromString('d');

// Set, fully commutative, with tombstones.
// You can either add or remove an atom/tuple.
// Equal elements possible.
export function reduce(batch: Batch): Frame {
  const ret = new Frame();
  if (!batch.length) return ret;

  for (const frame of batch) {
    if (batch.length === 1) return frame;
    for (const op of frame) {
      const head = new Op(type, op.uuid(1), op.uuid(2), op.uuid(3), undefined, FRAME_SEP);

      const theLastOne = Op.fromString(batch.frames[batch.length - 1].toString());
      if (theLastOne) head.event = theLastOne.event;

      if (op.isHeader() && op.uuid(3).isZero()) {
        head.location = ZERO;
      } else {
        head.location = DELTA;
      }

      ret.push(head);
      heap.clear();
      heap.put(batch);

      while (!heap.eof()) {
        const current = heap.current();
        if (!current) break;
        ret.pushWithTerm(current, ',');
        heap.nextPrim();
      }
      return ret;
    }
  }

  return ret;
}

function setComparator(a: Op, b: Op): number {
  let ae = a.uuid(2);
  let be = b.uuid(2);
  if (!a.uuid(3).isZero()) ae = a.uuid(3);
  if (!b.uuid(3).isZero()) be = b.uuid(3);
  return -ae.compare(be);
}

export const type = UUID.fromString('set');
export default {reduce, type};
