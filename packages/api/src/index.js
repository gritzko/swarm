// @flow

import regeneratorRuntime from 'regenerator-runtime';

import Client from 'swarm-client';
import Op, {Frame, ZERO, UUID, FRAME_SEP, js2ron} from 'swarm-ron';
import {ZERO as ZERO_UUID} from 'swarm-ron-uuid';
import {lww, set, ron2js} from 'swarm-rdt';
import type {Atom} from 'swarm-ron';
import type {Options as ClntOpts} from 'swarm-client';

export type Options = ClntOpts;
export type Value = {[string]: Atom | Value} | null;

export default class API {
  client: Client;
  options: Options;
  subs: Array<Subscription>;
  cache: {[string]: Value};

  constructor(options: Options): API {
    this.client = new Client(options);
    this.options = options;
    this.subs = [];
    this.cache = {};
    return this;
  }

  ensure(): Promise<void> {
    return this.client.ensure();
  }

  uuid(): UUID {
    if (!this.client.clock) throw new Error('have no clock yet, invoke `await api.ensure()` first');
    return this.client.clock.time();
  }

  async on(id: string, cbk: (value: Value) => void): Promise<Subscription | void> {
    if (!id || !cbk) return;
    for (const sub of this.subs) {
      if (sub.id === id && sub.cbk === cbk) return sub;
    }

    const sub = new Subscription(this.client, this.cache, id, cbk);
    this.subs.push(sub);
    await sub.on();
    return sub;
  }

  off(id: string, cbk: Value => void): boolean {
    if (!id || !cbk) return false;
    let i = -1;
    for (const sub of this.subs) {
      i++;
      if (sub.id === id && sub.cbk === cbk) {
        this.subs.splice(i, 1);
        return sub.off();
      }
    }
    return false;
  }

  async lset(id: string, value: {[string]: Atom | void}): Promise<boolean> {
    if (!id) return false;
    await this.client.ensure();
    const frame = new Frame();
    let op = new Op(lww.type, UUID.fromString(id), this.uuid(), ZERO_UUID, undefined, FRAME_SEP);
    frame.push(op);

    for (const k of Object.keys(value)) {
      op = op.clone();
      op.location = UUID.fromString(k);
      if (value[k] !== undefined) {
        op.values = js2ron([value[k]]);
      }
      frame.pushWithTerm(op, ',');
    }

    if (frame.toString()) {
      await this.client.push(frame.toString());
      return true;
    }
    return false;
  }

  async sadd(id: string, value: Atom): Promise<boolean> {
    if (!id) return false;
    await this.client.ensure();
    const frame = new Frame();
    const time = this.uuid();
    let op = new Op(set.type, UUID.fromString(id), time, ZERO_UUID, undefined, FRAME_SEP);
    frame.push(op);
    op = op.clone();

    op.values = js2ron([value]);
    frame.pushWithTerm(op, ',');

    await this.client.push(frame.toString());
    return true;
  }

  async srm(id: string, value: Atom): Promise<boolean> {
    if (!id) return false;
    await this.client.ensure();
    const frame = new Frame();
    let deleted = false;
    let op = new Op(set.type, UUID.fromString(id), this.uuid(), ZERO_UUID, undefined, FRAME_SEP);
    frame.push(op);

    const local = await this.client.storage.get(id);
    if (!local) return false;

    const str = js2ron([value]);
    for (const v of new Frame(local)) {
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

class Subscription {
  cache: {[string]: Value};
  client: Client;
  id: string;
  prev: string;
  cbk: Value => void;
  keys: {[string]: true};
  active: boolean | void;

  constructor(client: Client, cache: {[string]: Value}, id: string, cbk: Value => void): Subscription {
    this.client = client;
    this.cache = cache;
    this.id = id;
    this.cbk = cbk;
    this.prev = new Op(ZERO_UUID, UUID.fromString(id), ZERO_UUID, ZERO_UUID).toString();
    this.keys = {};
    this.keys[this.id] = true;
    // $FlowFixMe
    this._invoke = this._invoke.bind(this);
    return this;
  }

  off(): boolean {
    if (this.active === true) {
      return (this.active = this.client.off(this.prev, this._invoke));
    }
    return false;
  }

  async on(): Promise<boolean> {
    if (this.active !== undefined) return false;
    this.active = await this.client.on(this.prev, this._invoke);
    return this.active || false;
  }

  _invoke(f: string, s: string): void {
    // prevent unauthorized calls
    if (this.active === false) {
      this.client.off(f, this._invoke);
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

function getOff(keys: {[string]: true}, ids: string): string {
  const ret = new Frame();
  for (const op of new Frame(ids)) {
    const id = op.object.toString();
    if (!keys[id]) ret.push(op);
  }
  return ret.toString();
}
