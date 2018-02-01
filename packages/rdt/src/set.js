// @flow

import Op, {ZERO as ZERO_OP, FRAME_SEP, Batch, Frame, Cursor} from 'swarm-ron';
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

export function ron2js(rawFrame: string): {[string]: Atom} {
  const set = new Frame(rawFrame);
  const values: {[string]: true} = {};
  const ret = {};
  const proto = {length: 0, id: '', type: 'set'};

  for (const op of set) {
    if (!proto.id) proto.id = op.uuid(1).toString();
    if (proto.id !== op.uuid(1).toString() || !op.isRegular()) {
      continue;
    }
    if (op.values && !values[op.values]) {
      values[op.values] = true;
      ret[proto.length++] = {
        value: op.value(0),
        writable: false,
        enumerable: true,
      };
    }
  }

  return Object.create(proto, ret);
}

export default {reduce, type, setComparator, ron2js};
