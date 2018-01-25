// @flow

import {Frame} from './index';

export default class Batch {
  frames: Array<Frame>;

  constructor(frames: Array<Frame>) {
    this.frames = frames;
  }

  toString(): string {
    let ret: Array<string> = [];
    for (const c of this.frames) {
      ret.push(c.toString());
    }
    return ret.join('\n');
  }

  get length(): number {
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
    if (this.length !== other.length) {
      return false;
    }

    for (let i = 0; i < this.length; i++) {
      if (!this.frames[i].equal(other.frames[i])) {
        return false;
      }
    }

    return true;
  }
}
