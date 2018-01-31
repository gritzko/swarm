// @flow

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
  cbks: Array<[string, (string, string) => void, (Value) => void]>;
  cache: {[string]: {[string]: Atom, _id: string, length: number}};

  constructor(options: Options) {
    this.client = new Client(options);
    this.options = options;
    this.cbks = [];
    this.cache = {};
  }

  async ensure(): Promise<void> {
    await this.client.ensure();
  }

  uuid(): UUID {
    if (!this.client.clock) throw new Error('have no clock yet, invoke `await api.ensure()` first');
    return this.client.clock.time();
  }

  async on(id: string, cbk: (value: Value) => void): Promise<boolean> {
    if (!id || !cbk) return false;
    const sub = await this.client.on(
      new Op(ZERO_UUID, UUID.fromString(id), ZERO_UUID, ZERO_UUID).toString(),
      this._wrap(id, cbk),
    );
    return sub;
  }

  off(id: string, cbk: Value => void): boolean {
    if (!id || !cbk) return false;
    for (const [_id, a, b] of this.cbks) {
      if (_id === id && b === cbk) {
        const {frame} = buildTree(this.cache, id);
        return this.client.off(frame.toString(), a);
      }
    }
    return false;
  }

  _wrap(id: string, cbk: Value => void): (string, string) => void {
    for (const [_id, a, b] of this.cbks) {
      if (_id === id && b === cbk) return a;
    }

    const wrap = new Wrapper(this, id, cbk, `#${id};`);

    this.cbks.push([id, wrap.callback, cbk]);
    return wrap.callback;
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
      // console.log('push to the client', frame.toString());
      await this.client.push(frame.toString());
      return true;
    }
    return false;
  }

  async sadd(id: string, value: Atom): Promise<boolean> {
    if (!id) return false;
    await this.client.ensure();
    const frame = new Frame('');
    let op = new Op(set.type, UUID.fromString(id), this.uuid(), ZERO_UUID, undefined, FRAME_SEP);
    frame.push(op);
    op = op.clone();

    op.location = this.uuid();
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
      if (v.values === str) {
        deleted = true;
        op = op.clone();
        op.location = op.event;
        op.values = '';
        frame.pushWithTerm(op, ',');
      }
    }

    if (deleted) await this.client.push(frame.toString());
    return deleted;
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
  root = {...root};
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

class Wrapper {
  self: API;
  id: string;
  prev: string;
  cbk: Value => void;

  constructor(self: API, id: string, cbk: Value => void, prev: string): Wrapper {
    this.self = self;
    this.id = id;
    this.prev = '';
    this.cbk = cbk;
    // $FlowFixMe
    this.callback = this.callback.bind(this);
    return this;
  }

  callback(_: string, s: string): void {
    if (!s) return;
    const v = ron2js(s);
    if (!v) return;

    // $FlowFixMe ?
    this.self.cache[v._id] = v;
    const {ids, frame, tree} = buildTree(this.self.cache, this.id);

    if (this.prev !== frame.toString()) {
      this.self.client.on(frame.toString(), this.callback);
    }

    // get the difference and unsubscribe from lost refs
    const off = getOff(ids, this.prev);
    if (off) {
      console.log('client.off', off, this.id, ids, this.prev, tree, v, s);
      this.self.client.off(off, this.callback);
    }
    this.prev = frame.toString();
    this.cbk(tree);
  }
}
