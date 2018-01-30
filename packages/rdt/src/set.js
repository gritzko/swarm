// @flow

import Op, {ZERO as ZERO_OP, FRAME_SEP, Batch, Frame, Cursor, ron2js as RON2JS} from 'swarm-ron';
import type {Atom} from 'swarm-ron';
import UUID, {ZERO} from 'swarm-ron-uuid';
import IHeap, {refComparatorDesc} from './iheap';

export const type = UUID.fromString('set');
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

export function setComparator(a: Op, b: Op): number {
  let ae = a.uuid(2);
  let be = b.uuid(2);
  if (!a.uuid(3).isZero()) ae = a.uuid(3);
  if (!b.uuid(3).isZero()) be = b.uuid(3);
  return -ae.compare(be);
}

export function ron2js(rawFrame: string): {[string]: Atom, _id: string, length: number | void} | null {
  const set = new Frame(rawFrame);
  const values: {[string]: boolean} = {};
  const ret = {length: 0, _id: ''};

  for (const op of set) {
    if (!ret._id) ret._id = op.uuid(1).toString();
    if (ret._id !== op.uuid(1).toString() || !op.isRegular()) {
      continue;
    }
    if (op.values && !values[op.values]) {
      values[op.values] = true;
      ret[ret.length++] = RON2JS(op.values).pop();
    }
  }

  return ret.length ? Object.freeze(ret) : null;
}

export default {reduce, type, setComparator, ron2js};
