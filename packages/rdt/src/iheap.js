// @flow

import Op, { UUID, Frame, Batch, Cursor, ZERO } from '@swarm/ron';

export default class IHeap {
  iters: Array<Cursor>;
  primary: (Op, Op) => number;
  secondary: ?(Op, Op) => number;

  constructor(primary: (Op, Op) => number, secondary?: (Op, Op) => number) {
    this.iters = new Array(1);
    this.primary = primary;
    this.secondary = secondary;
  }

  _less(i: number, j: number): boolean {
    const ii = this.iters[i].op || ZERO;
    const jj = this.iters[j].op || ZERO;
    let c = this.primary(ii, jj);
    if (c === 0 && this.secondary) {
      c = this.secondary(ii, jj);
    }
    return c < 0;
  }

  _sink(i: number) {
    let to = i;
    let j = i << 1;
    if (j < this.iters.length && this._less(j, i)) {
      to = j;
    }
    j++;

    if (j < this.iters.length && this._less(j, to)) {
      to = j;
    }

    if (to !== i) {
      this._swap(i, to);
      this._sink(to);
    }
  }

  _raise(i: number) {
    const j = i >> 1;
    if (j > 0 && this._less(i, j)) {
      this._swap(i, j);
      if (j > 1) {
        this._raise(j);
      }
    }
  }

  _swap(i: number, j: number) {
    const memo = this.iters[i];
    this.iters[i] = this.iters[j];
    this.iters[j] = memo;
  }

  get length(): number {
    return this.iters.length;
  }

  put(input: Frame | Batch) {
    const batch = input instanceof Batch ? input : new Batch(input);
    for (const item of batch) {
      const cursor = new Cursor(item.body);
      while (cursor.op && !cursor.op.isRegular()) cursor.next();
      if (cursor.op && cursor.op.isRegular()) {
        const at = this.iters.length;
        this.iters.push(cursor);
        this._raise(at);
      }
    }
  }

  current(): ?Op {
    return this.iters.length > 1 ? this.iters[1].op : null;
  }

  _remove(i: number) {
    if (this.iters.length === 2 && i === 1) {
      this.clear();
    } else {
      if (this.iters.length - 1 === i) {
        this.iters.pop();
      } else {
        this.iters.splice(i, 1, this.iters.pop());
      }
      this._sink(i);
    }
  }

  _next(i: number) {
    this.iters[i].next();
    if (!this.iters[i].op || this.iters[i].op.isHeader()) {
      this._remove(i);
    } else {
      this._sink(i);
    }
  }

  next(): ?Op {
    this._next(1);
    return this.current();
  }

  eof(): boolean {
    return this.iters.length <= 1;
  }

  clear() {
    this.iters = new Array(1);
  }

  frame(): Frame {
    const cur = new Frame();
    while (!this.eof()) {
      const op = this.current();
      if (op) {
        cur.push(op);
      }
      this.next();
    }
    return cur;
  }

  nextPrim(): ?Op {
    const eqs: Array<number> = [];
    this._listEqs(1, eqs);
    if (eqs.length > 1) {
      eqs.sort();
    }
    for (let i = eqs.length - 1; i >= 0; i--) {
      this._next(eqs[i]);
      // this._sink(eqs[i]);
    }
    return this.current();
  }

  _listEqs(at: number, eqs: Array<number>) {
    eqs.push(at);
    const l = at << 1;
    if (l < this.iters.length) {
      if (
        0 === this.primary(this.iters[1].op || ZERO, this.iters[l].op || ZERO)
      ) {
        this._listEqs(l, eqs);
      }
      const r = l | 1;
      if (r < this.iters.length) {
        if (
          0 === this.primary(this.iters[1].op || ZERO, this.iters[r].op || ZERO)
        ) {
          this._listEqs(r, eqs);
        }
      }
    }
  }
}

function comparator(
  n: 0 | 1 | 2 | 3,
  desc: boolean = false,
): (Op, Op) => number {
  return (...args: Array<Op>): number => {
    if (desc) args.reverse();
    return args[0].uuid(n).compare(args[1].uuid(n));
  };
}

export const eventComparator = comparator(2);
export const eventComparatorDesc = comparator(2, true);
export const refComparator = comparator(3);
export const refComparatorDesc = comparator(3, true);
