// @flow

import Op, {Frame, Batch, FRAME_SEP, ron2js as RON2JS} from 'swarm-ron';
import UUID, {ZERO} from 'swarm-ron-uuid';
import IHeap, {refComparator, eventComparatorDesc} from './iheap';

import type {Scalar} from './index';

export const type = UUID.fromString('lww');
const DELTA = UUID.fromString('d');
const heap = new IHeap(refComparator, eventComparatorDesc);

// Last-write-wins reducer.
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

export function ron2js(rawFrame: string): {[string]: Scalar, _id: string, length: number | void} | null {
  const ret = {};
  const lww: Frame = new Frame(rawFrame);
  let length: number = 0;

  for (const op of lww) {
    const id = op.object.toString();
    ret._id = ret._id || id;
    if (id !== ret._id || op.isHeader() || op.isQuery()) continue;

    let value = RON2JS(op.values).pop();

    let key = op.location.toString();
    if (op.location.isHash()) {
      if (op.location.value !== '~') {
        throw new Error('only flatten arrays are beign supported');
      }
      key = op.location.origin;
    }
    if (length > -1) {
      const p = parseInt(key);
      if (!isNaN(p)) {
        length = Math.max(p + 1, length);
      } else {
        length = -1;
      }
    }
    ret[key] = value;
  }

  if (Object.keys(ret).length > 1 && length > 0) {
    ret.length = length;
  }

  return Object.freeze(Object.keys(ret) ? ret : null);
}

export default {reduce, type, ron2js};
