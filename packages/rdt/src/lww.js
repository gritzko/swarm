// @flow
'use strict';

import Op, {Frame, Batch, FRAME_SEP, ron2js as RON2JS} from 'swarm-ron';
import UUID, {ZERO} from 'swarm-ron-uuid';
import IHeap, {refComparator, eventComparatorDesc} from './iheap';

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

export function ron2js(rawFrame: string): mixed {
  let rootID = null;
  const refs = {};
  const lww = new Frame(rawFrame);
  let hasValue = false;

  for (const op of lww) {
    hasValue = true;
    const id = op.object.toString();
    rootID = rootID || id;
    if (op.isHeader() || op.isQuery()) continue;
    const ref = refs[id] || (refs[id] = op.location.isHash() ? [] : {});
    let value = RON2JS(op.values).pop();
    if (value instanceof UUID) {
      value = {$ref: value.toString()};
    }

    let key = op.location.toString();
    if (op.location.isHash()) {
      if (op.location.value !== '~') {
        throw new Error('only flatten arrays are beign supported');
      }
      key = parseInt(op.location.origin);
      if (isNaN(key)) {
        throw new Error('malformed index value: ' + op.location.origin);
      }
    }

    ref[key] = value;
    // $FlowFixMe
    ref._id = id;
  }

  if (!hasValue) return null;

  Object.keys(refs).forEach(key => {
    const value = refs[key];
    if (Array.isArray(value)) {
      refs[key] = value.map(v => {
        if (isObject(v) && !!v['$ref']) {
          return refs[v['$ref']] || v;
        } else {
          return v;
        }
      });
      refs[key]._id = value._id;
    } else if (isObject(value)) {
      Object.keys(value).forEach(k => {
        if (isObject(value[k]) && !!value[k]['$ref']) {
          refs[key][k] = refs[value[k]['$ref']] || value[k];
        }
      });
    } else {
      throw new Error('unexpected value');
    }
  });

  // $FlowFixMe
  return Object.freeze(refs[rootID] || null);
}

function isObject(o) {
  return !!o && o.constructor === Object;
}

export default {reduce, type, ron2js};
