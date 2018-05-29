// @flow

import regeneratorRuntime from 'regenerator-runtime';
import hash from 'object-hash';

import Client from '@swarm/client';
import Op, { Frame, ZERO, UUID, FRAME_SEP, js2ron } from '@swarm/ron';
import { ZERO as ZERO_UUID } from '@swarm/ron-uuid';
import { lww, set, ron2js } from '@swarm/rdt';
import type { Atom } from '@swarm/ron';
import type { Options as ClntOpts } from '@swarm/client';

export type Options = ClntOpts & {
  gcPeriod?: number,
  strictMode?: boolean,
};

export type Value = { [string]: Atom | Value } | Value[] | null;

interface Subscription {
  off(): boolean;
  is(hash: string): boolean;
}

export default class API {
  client: Client;
  options: Options;
  subs: Array<Subscription>;
  cache: { [string]: { [string]: Atom } };
  gcInterval: IntervalID;

  constructor(options: Options): API {
    this.client = new Client(options);
    this.options = options;
    this.subs = [];
    this.cache = {};
    if (options.gcPeriod) {
      this.gcInterval = setInterval(this.gc.bind(this), options.gcPeriod);
    }
    // $FlowFixMe
    this.uuid = this.uuid.bind(this);
    return this;
  }

  ensure(): Promise<void> {
    return this.client.ensure();
  }

  uuid(): UUID {
    if (!this.client.clock)
      throw new Error(
        'have no clock yet, invoke `await <swarm>.ensure()` first',
      );
    return this.client.clock.time();
  }

  // garbage collection for unused cached data
  gc(): {| deleted: number, existing: number |} {
    const ret = { deleted: 0, existing: 0 };
    const lstnrs = {};
    for (const id of Object.keys(this.client.lstn)) lstnrs[id] = true;

    for (const id of Object.keys(this.cache)) {
      if (!lstnrs[id]) {
        delete this.cache[id];
        ret.deleted++;
      } else {
        ret.existing++;
      }
    }

    return ret;
  }

  async set(
    id: string | UUID,
    value: { [string]: Atom | void },
  ): Promise<boolean> {
    if (!id) return false;
    const uuid = id instanceof UUID ? id : UUID.fromString(id);
    await this.client.ensure();

    if (this.options.strictMode) {
      const type = await this.typeOf(id);
      if (type && type !== lww.type.toString()) return false;
    }

    const frame = new Frame();

    frame.push(
      new Op(lww.type, uuid, this.uuid(), ZERO_UUID, undefined, FRAME_SEP),
    );

    for (const k of Object.keys(value).sort()) {
      const op = new Op(
        lww.type,
        uuid,
        frame.last.uuid(2),
        UUID.fromString(k),
        undefined,
        ',',
      );

      if (value[k] !== undefined) {
        op.values = js2ron([value[k]]);
        if (!uuid.isLocal() && value[k] instanceof UUID && value[k].isLocal()) {
          return false;
        }
      }

      frame.push(op);
    }

    if (frame.isPayload()) {
      await this.client.push(frame.toString());
      return true;
    }
    return false;
  }

  async add(id: string | UUID, value: Atom): Promise<boolean> {
    if (!id) return false;
    const uuid = id instanceof UUID ? id : UUID.fromString(id);
    await this.client.ensure();

    if (this.options.strictMode) {
      const type = await this.typeOf(id);
      if (type && type !== set.type.toString()) return false;
    }

    const frame = new Frame();
    const time = this.uuid();
    let op = new Op(set.type, uuid, time, ZERO_UUID, undefined, FRAME_SEP);
    frame.push(op);
    op = op.clone();

    if (!uuid.isLocal() && value instanceof UUID && value.isLocal()) {
      return false;
    }

    op.values = js2ron([value]);
    frame.pushWithTerm(op, ',');

    await this.client.push(frame.toString());
    return true;
  }

  async remove(id: string | UUID, value: Atom): Promise<boolean> {
    if (!id) return false;
    const uuid = id instanceof UUID ? id : UUID.fromString(id);
    id = uuid.toString();
    await this.client.ensure();

    if (this.options.strictMode) {
      const type = await this.typeOf(id);
      if (type !== set.type.toString()) return false;
    }

    const frame = new Frame();
    const ts = this.uuid();
    let deleted = false;
    let op = new Op(set.type, uuid, ts, ZERO_UUID, undefined, FRAME_SEP);
    frame.push(op);

    let state = await this.client.storage.get(id);
    if (!state) return false;

    const str = js2ron([value]);
    for (const v of new Frame(state)) {
      if (!v.isRegular()) continue;
      if (v.values === str) {
        deleted = true;
        op = op.clone();
        op.location = v.event;
        op.values = '';
        frame.pushWithTerm(op, ',');
      }
    }

    if (deleted) {
      await this.client.push(frame.toString());
    }
    return deleted;
  }

  close(): Promise<void> {
    return this.client.close();
  }

  open(): void {
    return this.client.open();
  }

  async typeOf(id: string | UUID): Promise<string | null> {
    const obj = this.cache[id.toString()];
    if (obj !== undefined) {
      // found in cache
      return obj && obj.type && typeof obj.type === 'string' ? obj.type : '';
    }

    const state = await this.client.storage.get(id.toString());
    if (state) {
      const op = Op.fromString(state);
      if (op) return op.uuid(0).toString();
    }
    // type is not defined
    return null;
  }
}
