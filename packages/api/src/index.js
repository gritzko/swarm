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
    this.cache = {};
  }

  uuid(): UUID {
    if (!this.client.clock) throw new Error('have no clock yet, invoke `await api.ensure()` first');
    return this.client.clock.time();
  }

  async on(id: string, cbk?: (value: Value) => void): Promise<boolean> {
    if (!id) return false;
    const subscribed = await this.client.on(id, cbk ? this._wrap(id, cbk) : undefined);
    return subscribed;
  }

  off(id: string, cbk: Value => void): boolean {
    if (!id) throw new Error('id not found');
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

    const self = this;

    function a(_: string, s: string) {
      const v = ron2js(s);
      if (!v) return;
      // $FlowFixMe ?
      self.cache[v._id] = v;
      const {frame, tree} = buildTree(self.cache, id);
      self.client.on(frame.toString(), this);
      cbk(tree);
    }

    a.bind(a);

    this.cbks.push([id, a, cbk]);
    return a;
  }

  async lwwSet(id: string, value: {[string]: Atom | void}): Promise<boolean> {
    if (!id) return false;
    const frame: Frame = new Frame();
    const op: Op = new Op(lww.type, UUID.fromString(id), this.uuid(), ZERO_UUID, undefined, FRAME_SEP);
    frame.pushWithTerm(op, '!');

    for (const k of Object.keys(value)) {
      op.location = UUID.fromString(k);
      if (value[k] !== undefined) {
        op.values = js2ron([value[k]]);
      }
      frame.pushWithTerm(op, ',');
    }

    if (frame.toString()) await this.client.push(frame.toString());
    return !!frame.toString();
  }

  async setAdd(id: string, value: Atom): Promise<boolean> {
    if (!id) return false;
    const frame = new Frame('');
    const op: Op = new Op(set.type, UUID.fromString(id), this.uuid(), ZERO_UUID);
    frame.pushWithTerm(op, '!');

    op.location = this.uuid();
    op.values = js2ron([value]);
    frame.pushWithTerm(op, ',');

    await this.client.push(frame.toString());
    return !!frame.toString();
  }

  async setRemove(id: string, value: Atom): Promise<boolean> {
    if (!id) return false;
    const frame: Frame = new Frame();
    let deleted = false;
    const op = new Op(set.type, UUID.fromString(id), this.uuid(), ZERO_UUID);
    frame.pushWithTerm(op, '!');

    const local = await this.client.storage.get(id);
    if (!local) return false;

    const str = js2ron([value]);
    for (const v of new Frame(local)) {
      if (v.values === str) {
        deleted = true;
        op.location = op.event;
        op.values = '';
        frame.pushWithTerm(op, ',');
      }
    }

    if (deleted) await this.client.push(frame.toString());
    return deleted;
  }
}

function buildTree(cache: *, id: string, frame: Frame = new Frame()): {frame: Frame, tree: Value} {
  frame.push(new Op(ZERO_UUID, UUID.fromString(id), ZERO_UUID, ZERO_UUID));
  let root = cache[id];
  if (!root) return {frame, tree: null};
  root = {...root};
  for (const key of Object.keys(root)) {
    const v = root[key];
    if (v instanceof UUID) {
      root[key] = buildTree(cache, v.toString(), frame).tree || Object.freeze({$ref: v.toString()});
    }
  }
  return {frame, tree: Object.freeze(root)};
}
