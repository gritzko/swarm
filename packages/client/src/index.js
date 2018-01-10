/* @flow */
'use strict';

import RWS from 'reconnectable-websocket';

import Op, {Frame, Cursor, UUID, QUERY_SEP, FRAME_SEP, mapUUIDs, js2ron} from 'swarm-ron';
import type {Clock} from 'swarm-clock';
import {Logical} from 'swarm-clock';
import {ZERO, NEVER} from 'swarm-ron-uuid';
import {reduce} from 'swarm-rdt';
import type {Storage} from './storage';
import {InMemory} from './storage';

export interface Connection {
  onmessage: (ev: MessageEvent) => any;
  onopen: (ev: Event) => any;
  send(data: string): void;
  readyState: number;
}

export type Meta = {
  name: string,
  clockMode?: 'Logical' | 'Epoch' | 'Calendar',
  clockLen?: number,
  forkMode?: string,
  peerIdBits?: number,
  horizont?: number,
  credentials?: {},
  seen?: string,
};

export type Options = {
  id: string,
  storage: Storage,
  upstream?: string | Connection,
  hsTimeout?: number,
  db?: Meta,
};

const defaultMeta: Meta = {
  name: 'default',
  clockLen: 5,
  forkMode: '// FIXME', // keep it sync with server
  peerIdBits: 30,
  horizont: 604800, // one week in seconds
};

/**
 * A simple client, keeps data in memory.
 *  Consumes updates from the server, feeds resulting RON states
 *  back to the listeners.
 */
export default class Client {
  log: Frame; // FIXME ??

  clock: ?Clock;
  lstn: {[key: string]: (frame: string, state: string) => void}; // ?
  upstream: Connection;
  storage: Storage;
  queue: Array<() => void> | void;
  db: Meta;
  id: string;
  options: {
    hsTimeout: number,
  };

  constructor(options: Options) {
    this.id = options.id;
    this.db = {
      ...defaultMeta,
      ...options.db,
    };
    this.storage = options.storage;
    this.lstn = {};
    this.log = new Frame();
    this.queue = [];
    this.options = {
      hsTimeout: options.hsTimeout || 3e5 /* 5 5min */,
    };
    this.init(options);
  }

  async init(options: Options) {
    const meta = await this.storage.get('__meta__');
    this.db = ({
      ...this.db,
      ...JSON.parse(meta || '{}'),
    }: Meta);

    switch (this.db.clockMode) {
      case 'Logical':
        this.clock = new Logical(this.id);
        await this.storage.set('__meta__', JSON.stringify(this.db));
        break;
      case 'Calendar':
      case 'Epoch':
        throw new Error(`TODO: '${this.db.clockMode}' clock is not supported yet`);
    }

    if (typeof options.upstream === 'string') {
      this.upstream = RWS(options.upstream, undefined, {reconnectOnError: true});
    } else if (options.upstream) {
      this.upstream = options.upstream;
    } else if (!options.upstream && this.db.clockMode) {
      this.upstream = new DevNull();
    } else if (!options.upstream && !this.db.clockMode) {
      throw new Error('neither connection options nor clock options found');
    }

    if (this.clock) this.release();

    await new Promise(r => {
      this.upstream.onopen = r;
    });
    await this.handshake();
    this.release();
  }

  async handshake(): Promise<void> {
    if (this.upstream instanceof DevNull) return;

    const hs = new Promise((resolve, reject) => {
      setTimeout(reject, this.options.hsTimeout);
      this.upstream.onmessage = (me: MessageEvent) => resolve(((me.data: any): string));
    });

    // reset listener
    const hello = new Frame();
    // new connection
    hello.push(
      new Op(
        new UUID('db', '0', '$'),
        new UUID(this.db.name, '0', '$'),
        new UUID(this.clock ? this.clock.last().value : '0', this.id, '+'),
        ZERO,
        QUERY_SEP + FRAME_SEP, // FIXME illigal shortcut
      ),
    );

    const creds = this.db.credentials || {};
    for (const cred of Object.keys(creds)) {
      const op = Op.fromString(`:${cred}${js2ron([creds[cred]])}`); // FIXME ?
      if (op) hello.push(op);
    }

    this.upstream.send(hello.toString());

    const resp = await hs;

    const dbOpts: Meta = {
      clockMode: 'Logical',
      ...this.db,
      credentials: {...this.db.credentials},
    };

    let seen: UUID = ZERO;
    for (const op of new Frame(resp)) {
      if (op.uuid(3).gt(seen)) seen = op.uuid(3);
      if (op.value(0)) {
        let key = op.uuid(2).toString();
        key = key[0].toLowerCase() + key.slice(1);
        dbOpts[key] = op.uuid(3).value;
      }
    }

    // read the first operation
    if (this.clock) {
      if (this.db.clockMode !== dbOpts.clockMode)
        throw new Error(
          `Different clock mode: '${this.db.clockMode || 'undefined'}' <-> '${dbOpts.clockMode || 'undefined'}'`,
        );
    } else {
      switch (dbOpts.clockMode) {
        case 'Logical':
          this.clock = new Logical(this.id);
        default:
          throw new Error(`Clock mode '${dbOpts.clockMode || 'undefined'}' is not supported yet`);
      }
    }

    this.clock.see(seen);

    // save meta info
    this.db = {...this.db, ...dbOpts};
    await this.storage.set('__meta__', JSON.stringify(this.db));
    this.upstream.onmessage = (me: MessageEvent) => this.onMessage(((me.data: any): string));
    this.upstream.onopen = () => this.handshake();

    const query = new Frame();
    for (const key of Object.keys(this.lstn)) {
      const op = Op.fromString(key + '?!'); // FIXME: check forkmode
      if (op) query.push(op);
    }
    this.upstream.send(query.toString());
  }

  async ensure(): Promise<void> {
    const {queue} = this;
    if (queue === undefined) {
      return Promise.resolve();
    } else
      return new Promise(r => {
        queue.push(r);
      });
  }

  release() {
    if (!this.queue) return;
    for (const cbk of this.queue) {
      cbk();
    }
    delete this.queue;
  }

  onMessage(message: string) {
    // TODO
  }

  /**
   * Install subscriptions.
   * @param query {String} - uuid/query/query frame
   * @param callback {Function}
   */
  async on(query: string, callback: (string, string) => void) {
    const fwd = new Frame();

    for (const op of new Frame(query)) {
      const key = op.key();
      let base = ZERO;

      const stored = await this.storage.get(key);
      if (stored) {
        callback('', stored);
        for (const op of new Frame(stored)) {
          base = op.event;
          break;
        }
      }
      if (this.lstn[key]) throw new Error('TODO: many listeners per obj');
      fwd.push(new Op(op.type, op.object, base, ZERO, QUERY_SEP));
      this.lstn[key] = callback;
    }

    this.upstream.send(fwd.toString());
  }

  async off(query: string, callback: ?(string, string) => void) {
    const fwd = new Frame();
    for (const op of new Frame(query)) {
      delete this.lstn[op.key()];
      this.upstream.send(new Op(op.type, op.object, NEVER, ZERO, '').toString()); // FIXME map?!
    }
  }

  async push(rawFrame: string) {
    const stamps: {[string]: UUID} = {};

    // replace
    const frame = mapUUIDs(rawFrame, (uuid, position, index, op): UUID => {
      if ([1, 2].indexOf(position) !== 1) return uuid;
      if (!uuid.isName() || !uuid.isZero()) return uuid;

      // const key = `${index}/${uuid.toString()}`
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
    if (!this.clock) throw new Error('have no clock yet');
    for (const op of new Frame(frame)) {
      if (op.event.origin === this.clock.origin) {
        // ack
      }

      const key = op.key();
      const state = await this.storage.get(key);
      const new_state = state ? reduce(state, frame) : frame;
      await this.storage.set(key, new_state);
      const l = this.lstn[key];
      if (l) l(frame, new_state);
      break;
    }
  }
}

class DevNull implements Connection {
  onmessage: (ev: MessageEvent) => any;
  onopen: (ev: Event) => any;
  readyState: number;
  constructor() {
    this.readyState = 3;
  }
  send(data: string): void {}
}
