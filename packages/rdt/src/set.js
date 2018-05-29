// @flow

import Op, { ZERO as ZERO_OP, FRAME_SEP, Batch, Frame, Cursor } from '@swarm/ron';
import type { Atom } from '@swarm/ron';
import UUID, { ZERO } from '@swarm/ron-uuid';
import IHeap, { refComparatorDesc } from './iheap';

export const type = UUID.fromString('set');
const heap = new IHeap(setComparator, refComparatorDesc);

// Set, fully commutative, with tombstones.
// You can either add or remove an atom/tuple.
// Equal elements possible.
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

export function setComparator(a: Op, b: Op): number {
  let ae = a.uuid(2);
  let be = b.uuid(2);
  if (!a.uuid(3).isZero()) ae = a.uuid(3);
  if (!b.uuid(3).isZero()) be = b.uuid(3);
  return -ae.compare(be);
}

export function ron2js(rawFrame: string): { [string]: Atom } {
  const set = new Frame(rawFrame);
  const values: { [string]: true } = {};
  const ret = {};
  let latest = ZERO;
  const proto = {
    length: 0,
    id: '',
    uuid: ZERO,
    type: 'set',
    version: '',
    values: function() {
      return Array.prototype.slice.call(this);
    },
    valueOf: function() {
      return this.values();
    },
    [Symbol.iterator]: function() {
      return this.values()[Symbol.iterator]();
    },
    toJSON: function() {
      return JSON.stringify(
        this.values().map(i => {
          if (i instanceof UUID) {
            return '#' + i.toString();
          } else return i;
        }),
      );
    },
  };

  for (const op of set) {
    if (op.event.gt(latest)) latest = op.event;
    if (!proto.id) {
      proto.id = op.uuid(1).toString();
      proto.uuid = Object.freeze(op.uuid(1));
    }
    if (!op.uuid(1).eq(proto.uuid) || !op.isRegular()) continue;
    if (op.values && !values[op.values]) {
      values[op.values] = true;
      ret[proto.length++] = {
        value: op.value(0),
        writable: false,
        enumerable: true,
      };
    }
  }
  proto.version = latest.toString();
  return Object.create(proto, ret);
}

export default { reduce, type, setComparator, ron2js };
