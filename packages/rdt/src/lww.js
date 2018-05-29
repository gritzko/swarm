// @flow

import Op, { Frame, Batch, FRAME_SEP } from '@swarm/ron';
import type { Atom } from '@swarm/ron';
import UUID, { ZERO } from '@swarm/ron-uuid';
import IHeap, { refComparator, eventComparatorDesc } from './iheap';

export const type = UUID.fromString('lww');
const heap = new IHeap(refComparator, eventComparatorDesc);

// Last-write-wins reducer.
export function reduce(batch: Batch): Frame {
  batch = batch.filter(f => !!f.body);
  const ret = new Frame();
  if (!batch.length) return ret;
  batch.sort().reverse();

  for (const frame of batch) {
    if (batch.length === 1) return frame;
    for (const op of frame) {
      ret.push(new Op(type, op.uuid(1), op.uuid(2), ZERO, undefined, FRAME_SEP));

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

export function ron2js(rawFrame: string): { [string]: Atom } {
  const ret = {};
  const proto = {};
  proto.type = 'lww';
  const lww = new Frame(rawFrame);
  let length: number = 0;
  let latest = ZERO;

  for (const op of lww.unzip().reverse()) {
    if (!proto.id) {
      proto.id = op.uuid(1).toString();
      proto.uuid = op.uuid(1);
      latest = op.event;
    }
    if (!op.uuid(1).eq(proto.uuid) || !op.isRegular()) continue;

    let value = op.value(0);

    let key = op.location.toString();
    if (op.location.isHash()) {
      if (op.location.value !== '~') {
        throw new Error('only flatten arrays are being supported');
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
    ret[key] = {
      value: value,
      writable: false,
      enumerable: true,
    };
  }

  proto.version = latest.toString();

  if (Object.keys(ret).length > 1 && length > 0) {
    proto.length = length;
    proto.values = function() {
      return Array.prototype.slice.call(this);
    };
    // $FlowFixMe
    proto.valueOf = function() {
      return this.values();
    };
    proto[Symbol.iterator] = function() {
      return this.values()[Symbol.iterator]();
    };
    proto.toJSON = function() {
      return JSON.stringify(
        this.values().map(i => {
          if (i instanceof UUID) {
            return '#' + i.toString();
          } else return i;
        }),
      );
    };
  }

  return Object.create(proto, ret);
}

export default { reduce, type, ron2js };
