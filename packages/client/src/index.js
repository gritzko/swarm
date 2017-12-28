/* @flow */
'use strict';

import RWS from 'reconnectable-websocket';

import Op, {Frame, Cursor, UUID, QUERY_SEP, mapUUIDs} from 'swarm-ron';
import type {Clock} from 'swarm-clock';
import {Logical} from 'swarm-clock';
import {ZERO, NEVER} from 'swarm-ron-uuid';
import {reduce} from 'swarm-rdt';
import type {Storage} from './storage';
import {InMemory} from './storage';

interface Connection {
  onmessage: (ev: MessageEvent) => any;
  send(data: string): void;
}

type Options = {
  id: string,
  db: string,

  url: ?string,
  connection: ?Connection,

  clock: ?Clock,
  storage: ?Storage,
};

/** A simple client, keeps data in memory.
 *  Consumes updates from the server, feeds resulting RON states
 *  back to the listeners. */
class Client {
  log: Frame; // FIXME

  clock: ?Clock;
  lstn: {[key: string]: (frame: string, state: string) => void}; // ?
  upstream: Connection;
  storage: Storage;
  _queue: Array<() => void> | false;

  constructor(options: Options) {
    this.clock = options.clock;
    this.lstn = {};
    this.log = new Frame();

    if (options.url) {
      this.upstream = RWS(options.url, undefined, {});
    } else if (options.connection) {
      this.upstream = options.connection;
    } else {
      throw new Error('neither url nor connection found');
    }

    this.upstream.onmessage = (e) => this.update(((e.data: any): string))

    if (options.storage) {
      this.storage = options.storage;
    } else {
      this.storage = new InMemory();
    }
  }

  /**
   * Ensure id replica was initialized.
   * First initialization requires online.
   */
  ensure(): Promise<void> {
    const q = this._queue;
    if (q === false) {
      return Promise.resolve();
    } else {
      return new Promise(resolve => q.push(resolve));
    }
  }

  /**
   * Install subscriptions.
   * @param query {String} - uuid/query/query frame
   * @param callback {Function}
   */
  async on(query: string, callback: (string, string) => void) {
    await this.ensure();
    const fwd = new Frame();

    for (const op of new Frame(query)) {
      const key = op.key();
      let base = ZERO;

      const stored = await this.storage.getItem(key);
      if (stored) {
        callback('', stored)
        base = new Cursor(stored).op.event;
      }
      if (this.lstn[key]) throw new Error('TODO: many listeners per obj');
      if (this.upstream) fwd.push(new Op(op.type, op.object, base, ZERO, QUERY_SEP));
      this.lstn[key] = callback;
    }

    if (this.upstream)
      this.upstream.send(fwd.toString());
  }

  async off(query: string, callback: ?(string, string) => void) {
    await this.ensure();
    const fwd = new Frame();
    for (const op of new Frame(query)) {
      delete this.lstn[op.key()];
      this.upstream.send(new Op(op.type, op.object, NEVER, ZERO, '').toString()); // FIXME map?!
    }
  }

  async push(rawFrame: string) {
    await this.ensure();
    const stamps: {[string]: UUID} = {};

    // replace
    const frame = mapUUIDs(rawFrame.toString(), (uuid, position, index, op): UUID =>  {
      // if (!uuid.isName() || !uuid.isZero()) return uuid;
      // if (stamps[uuid]) return stamps[uuid];
      // return (stamps[uuid] = this.clock.time());
      // TODO
      return ZERO;
    });

    // update
    this.update(frame);
    // save
    const op = Op.fromString(frame);
    if (op) this.log.push(op);
    // if (this.upstream) this.upstream.push(new Op.Cursor(frame));
  }

  /**
   *
   * @param frame {String} -- a single RON frame
   */
  async update(frame: string) {
    // ALLOWED INPUTS:
    // - op
    // - ack op
    // - state frame
    // - batch frame (split, repeat) TODO
    if (!this.clock) throw new Error('have no clock yet')
    const i = new Cursor(frame);
    if (i.op.event.origin === this.clock.origin) {
      // ack
    }

    const key = i.op.key();
    const state = await  this.storage.getItem(key)
    const new_state = state ? reduce(state, frame) : frame;
    await this.storage.setItem(key, new_state);
    const l = this.lstn[key];
    if (l) l(frame, new_state);
  }
}

module.exports = Client;
