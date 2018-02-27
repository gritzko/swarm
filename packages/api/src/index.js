// @flow

import regeneratorRuntime from 'regenerator-runtime';
import hash from 'object-hash';

import Client from 'swarm-client';
import Op, {Frame, ZERO, UUID, FRAME_SEP, js2ron} from 'swarm-ron';
import {ZERO as ZERO_UUID} from 'swarm-ron-uuid';
import {lww, set, ron2js} from 'swarm-rdt';
import type {Atom} from 'swarm-ron';
import type {Options as ClntOpts} from 'swarm-client';

export type Options = ClntOpts & {
  gcPeriod?: number,
};

export type Value = {[string]: Atom | Value} | Value[] | null;

interface Subscription {
  off(): boolean;
  is(hash: string): boolean;
}

export default class API {
  client: Client;
  options: Options;
  subs: Array<Subscription>;
  cache: {[string]: {[string]: Atom}};
  gcInterval: IntervalID;

  constructor(options: Options): API {
    this.client = new Client(options);
    this.options = options;
    this.subs = [];
    this.cache = {};
    if (options.gcPeriod) {
      this.gcInterval = setInterval(this.gc.bind(this), options.gcPeriod);
    }
    return this;
  }

  ensure(): Promise<void> {
    return this.client.ensure();
  }

  uuid(): UUID {
    if (!this.client.clock) throw new Error('have no clock yet, invoke `await <swarm>.ensure()` first');
    return this.client.clock.time();
  }

  async on(id: string | UUID, cbk: (value: Value) => void): Promise<boolean> {
    if (!id || !cbk) return false;
    const h = OnSub.hash(id.toString(), cbk);
    for (const sub of this.subs) {
      if (sub.is(h)) return false;
    }
    const sub = new OnSub(this.client, this.cache, id.toString(), cbk);
    this.subs.push(sub);
    const subscribed = await sub.on();
    return subscribed;
  }

  off(id: string | UUID, cbk: Value => void): boolean {
    if (!id || !cbk) return false;
    let i = -1;
    const h = OnSub.hash(id.toString(), cbk);
    for (const sub of this.subs) {
      i++;
      if (sub.is(h)) {
        this.subs.splice(i, 1);
        return sub.off();
      }
    }
    return false;
  }

  // garbage collection for unused cached data
  gc(): {|deleted: number, existing: number|} {
    const ret = {deleted: 0, existing: 0};
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

  async set(id: string | UUID, value: {[string]: Atom | void}): Promise<boolean> {
    if (!id) return false;
    const uuid = id instanceof UUID ? id : UUID.fromString(id);
    await this.client.ensure();
    const frame = new Frame();
    let op = new Op(lww.type, uuid, this.uuid(), ZERO_UUID, undefined, FRAME_SEP);
    frame.push(op);

    for (const k of Object.keys(value)) {
      op = op.clone();
      op.location = UUID.fromString(k);
      if (value[k] !== undefined) {
        op.values = js2ron([value[k]]);
        if (!uuid.isLocal() && value[k] instanceof UUID && value[k].isLocal()) {
          return false;
        }
      }
      frame.pushWithTerm(op, ',');
    }

    if (frame.toString()) {
      await this.client.push(frame.toString());
      return true;
    }
    return false;
  }

  async add(id: string | UUID, value: Atom): Promise<boolean> {
    if (!id) return false;
    const uuid = id instanceof UUID ? id : UUID.fromString(id);
    await this.client.ensure();
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
    const frame = new Frame();
    let deleted = false;
    const ts = this.uuid();
    let op = new Op(set.type, uuid, ts, ZERO_UUID, undefined, FRAME_SEP);
    frame.push(op);

    let state = await this.client.storage.get(id);
    if (!state) {
      state = await this.client.once(`#${id}`);
    }

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
}

interface IClient {
  on(id: string, cbk: (f: string, s: string) => void): Promise<boolean>;
  off(id: string, cbk: (f: string, s: string) => void): string | void;
}

class OnSub {
  cache: {[string]: {[string]: Atom}};
  client: IClient;
  id: string;
  prev: string;
  cbk: Value => void;
  keys: {[string]: true};
  active: boolean | void;
  hash: string;

  constructor(client: IClient, cache: {[string]: {[string]: Atom}}, id: string, cbk: Value => void): OnSub {
    this.client = client;
    this.cache = cache;
    this.id = id;
    this.cbk = cbk;
    this.hash = OnSub.hash(id, cbk);
    this.prev = new Op(ZERO_UUID, UUID.fromString(id), ZERO_UUID, ZERO_UUID).toString();
    this.keys = {};
    this.keys[this.id] = true;
    // $FlowFixMe
    this._invoke = this._invoke.bind(this);
    return this;
  }

  is(hash: string): boolean {
    return this.hash === hash;
  }

  off(): boolean {
    if (this.active === true) {
      return (this.active = !!this.client.off(this.prev, this._invoke));
    }
    return false;
  }

  async on(): Promise<boolean> {
    if (this.active !== undefined) return false;
    const {frame} = buildTree(this.cache, this.id);
    this.active = await this.client.on((this.prev = frame.toString()), this._invoke);
    return this.active || false;
  }

  _invoke(l: string, s: string): void {
    // TODO handle log and state

    // prevent unauthorized calls
    if (this.active === false) {
      this.client.off('', this._invoke);
      return;
    }
    if (!s) return;
    const v = ron2js(s);
    if (!v) return;

    // $FlowFixMe ?
    this.cache[v.id] = v;
    const {ids, frame, tree} = buildTree(this.cache, this.id);

    if (this.prev !== frame.toString()) {
      this.keys = ids;
      this.client.on(frame.toString(), this._invoke);

      // get the difference and unsubscribe from lost refs
      const off = getOff(ids, this.prev);
      if (off) this.client.off(off, this._invoke);
      this.prev = frame.toString();
    }

    this.cbk(tree);
  }

  static hash(id: string, cbk: Value => void): string {
    return hash({id, cbk});
  }
}

function buildTree(
  cache: *,
  id: string,
  frame: Frame = new Frame(),
  ids: {[string]: true} = {},
): {frame: Frame, tree: Value, ids: {[string]: true}} {
  ids[id] = true;
  frame.push(new Op(ZERO_UUID, UUID.fromString(id), ZERO_UUID, ZERO_UUID));
  let root = cache[id];
  if (!root) return {frame, tree: null, ids};
  // $FlowFixMe
  root = Object.assign(Object.create(Object.getPrototypeOf(root)), root);
  for (const key of Object.keys(root)) {
    const v = root[key];
    if (v instanceof UUID) {
      root[key] = buildTree(cache, v.toString(), frame, ids).tree || Object.freeze(v);
    }
  }
  return {frame, tree: Object.freeze(root), ids};
}

export function getOff(keys: {[string]: true}, ids: string): string {
  const ret = new Frame();
  for (const op of new Frame(ids)) {
    const id = op.object.toString();
    if (!keys[id]) ret.push(op);
  }
  return ret.toString();
}
