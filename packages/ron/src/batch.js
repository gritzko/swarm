// @flow

import Op, { Frame } from './index';
import { ZERO } from '@swarm/ron-uuid';

export default class Batch implements Iterator<Frame> {
  frames: Array<Frame>;
  index: 0;

  constructor(...frames: Array<Frame>): Batch {
    this.frames = frames;
    this.index = 0;
    return this;
  }

  /*:: @@iterator(): Iterator<Frame> { return ({}: any); } */

  // $FlowFixMe - computed property
  [Symbol.iterator](): Iterator<Frame> {
    this.index = 0;
    return this;
  }

  clone(): Batch {
    return new Batch(...[...this.frames]);
  }

  push(f: Frame): Batch {
    this.frames.push(f);
    return this;
  }

  next(): IteratorResult<Frame, void> {
    if (this.frames.length > this.index) {
      return {
        done: false,
        value: this.frames[this.index++],
      };
    }
    return { done: true };
  }

  toString(): string {
    let ret: Array<string> = [];
    for (const c of this.frames) {
      ret.push(c.toString());
    }
    return ret.join('\n');
  }

  get length(): number {
    return this.frames.length;
  }

  get long(): number {
    let ret = 0;
    for (const c of this.frames) {
      ret += c.body.length;
    }
    return ret;
  }

  isEmpty(): boolean {
    return !!this.frames.length;
  }

  hasFullState(): boolean {
    for (const f of this.frames) {
      if (f.isFullState()) return true;
      break;
    }
    return false;
  }

  equal(other: Batch): boolean {
    if (this.long !== other.long) {
      return false;
    }

    for (let i = 0; i < this.length; i++) {
      if (!this.frames[i].equal(other.frames[i])) {
        return false;
      }
    }

    return true;
  }

  sort(compare?: (a: Frame, b: Frame) => number): Batch {
    this.frames.sort(
      compare ||
        ((a, b) => {
          const aop = Op.fromString(a.body);
          const bop = Op.fromString(b.body);
          if (aop && bop) return aop.uuid(2).compare(bop.uuid(2));
          throw new Error('unable to compare invalid frames');
        }),
    );
    return this;
  }

  reverse(): Batch {
    this.frames.reverse();
    return this;
  }

  filter(f: (frame: Frame) => boolean): Batch {
    return new Batch(...this.frames.filter(f));
  }

  static fromStringArray(...input: Array<string>): Batch {
    return new Batch(...input.map(i => new Frame(i)));
  }

  static splitByID(source: string): Batch {
    const b = new Batch();
    let id = ZERO;
    let c: Frame = new Frame();

    for (const op of new Frame(source)) {
      if (op.uuid(1).eq(id)) {
        c.push(op);
      } else {
        if (!id.eq(ZERO)) {
          b.push(c);
        }
        id = op.uuid(1);
        c = new Frame();
        c.push(op);
      }
    }
    b.push(c);
    return b;
  }
}
