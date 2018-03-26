// @flow

import type { Storage } from './storage';
import Op, { UUID } from 'swarm-ron';

// A wrapper for convenience and to work with pending
// ops in an efficient way.
class PendingOps {
  storage: Storage;
  ops: Array<string>;

  constructor(storage: Storage, ops: string[]): PendingOps {
    this.storage = storage;
    this.ops = ops;
    return this;
  }

  /*:: @@iterator(): Iterator<string> { return ({}: any); } */

  // $FlowFixMe - computed property
  [Symbol.iterator](): Iterator<string> {
    return this.ops[Symbol.iterator]();
  }

  push(frame: string): Promise<void> {
    this.ops = this.ops.concat(frame);
    return this.flush();
  }

  see(ack: UUID): Promise<void> {
    let i = -1;
    for (const _old of this.ops) {
      i++;
      const old = Op.fromString(_old);
      if (!old) throw new Error(`malformed op: '${_old}'`);

      if (old.event.gt(ack)) {
        this.ops = this.ops.slice(i + 1);
        break;
      }
    }
    if (i === this.ops.length - 1) this.ops = [];

    return this.flush();
  }

  flush(): Promise<void> {
    return this.storage.set(PendingOps.KEY, JSON.stringify(this.ops));
  }

  static async read(storage: Storage): Promise<PendingOps> {
    const pending = await storage.get(PendingOps.KEY);
    return new PendingOps(storage, JSON.parse(pending || '[]'));
  }

  static KEY: string;
}

PendingOps.KEY = '__pending__';

export default PendingOps;
