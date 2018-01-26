/* @flow */
'use strict';

import RWS from 'reconnectable-websocket';

import Op, {Batch, Frame, Cursor, UUID, QUERY_SEP, FRAME_SEP, mapUUIDs, js2ron} from 'swarm-ron';
import type {Clock} from 'swarm-clock';
import {Logical} from 'swarm-clock';
import {ZERO, NEVER} from 'swarm-ron-uuid';
import {lww} from 'swarm-rdt';
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
 * Consumes updates from the server, feeds resulting RON states
 * back to the listeners.
 */
export default class Client {
  clock: ?Clock;
  lstn: {[key: string]: (frame: string, state: string) => void}; // ?
  upstream: Connection;
  storage: Storage;
  queue: Array<[() => void, (err: Error) => void]> | void;
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
    this.queue = [];
    this.options = {
      hsTimeout: options.hsTimeout || 3e5 /* 5min */,
    };
    this.init(options);
  }

  async init(options: Options) {
    try {
      const meta = await this.storage.get('__meta__');
      this.db = ({
        ...this.db,
        ...JSON.parse(meta || '{}'),
      }: Meta);

      if (this.db.clockMode) {
        switch (this.db.clockMode) {
          case 'Logical':
            this.clock = new Logical(this.id);
            await this.storage.set('__meta__', JSON.stringify(this.db));
            break;
          default:
            throw new Error(`TODO: Clock mode '${this.db.clockMode}' is not supported yet`);
        }
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

      await new Promise(r => {
        this.upstream.onopen = r;
      });
      await this.handshake();
      this.release(null);
    } catch (e) {
      this.release(e);
    }
  }

  async handshake(): Promise<void> {
    if (this.upstream instanceof DevNull) return;

    const hs = new Promise((resolve, reject) => {
      setTimeout(reject, this.options.hsTimeout);
      this.upstream.onmessage = (me: MessageEvent) => resolve(((me.data: any): string));
    });

    const hello = new Frame();
    hello.push(
      new Op(
        new UUID('db', '0', '$'),
        new UUID(this.db.name, '0', '$'),
        new UUID(this.clock ? this.clock.last().value : '0', this.id, '+'),
        ZERO,
        QUERY_SEP,
      ),
    );
    hello.push(new Op(ZERO, ZERO, ZERO, ZERO, FRAME_SEP));

    const creds = this.db.credentials || {};
    for (const cred of Object.keys(creds)) {
      hello.push(new Op(ZERO, ZERO, ZERO, UUID.fromString(cred), js2ron([creds[cred]])));
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
      const val = op.value(0);
      if (val) {
        let key = op.uuid(3).toString();
        key = key[0].toLowerCase() + key.slice(1);
        dbOpts[key] = val instanceof UUID ? val.value : val;
      }
    }

    if (this.clock) {
      if (this.db.clockMode !== dbOpts.clockMode)
        throw new Error(
          `Different clock mode: '${this.db.clockMode || 'undefined'}' !== '${dbOpts.clockMode || 'undefined'}'`,
        );
    } else {
      switch (dbOpts.clockMode) {
        case 'Logical':
          this.clock = new Logical(this.id);
        default:
          throw new Error(`TODO: Clock mode '${dbOpts.clockMode || 'undefined'}' is not supported yet`);
      }
    }

    this.clock.see(seen);

    this.db = {...this.db, ...dbOpts};
    await this.storage.set('__meta__', JSON.stringify(this.db));
    this.upstream.onmessage = (me: MessageEvent) => this.onMessage(((me.data: any): string)).catch(panic);
    this.upstream.onopen = () => this.handshake().catch(panic);

    // resend all the frames
    const pending = await this.storage.get('__pending__');
    for (const frame of JSON.parse(pending || '[]')) {
      this.upstream.send(frame);
    }

    // resubscribe
    let query: string = '';
    for (const key of Object.keys(this.lstn)) {
      query += key;
    }
    if (query) await this.on(query);
  }

  /**
   * Ensure returns Promise which will be resolved after connection
   * installed or rejected if an error occurred.
   */
  async ensure(): Promise<void> {
    const {queue} = this;
    if (queue === undefined) {
      return Promise.resolve();
    } else {
      return new Promise((release, reject) => {
        queue.push([release, reject]);
      });
    }
  }

  release(err: Error | null) {
    if (!this.queue) return;
    for (const cbk of this.queue) {
      if (err) {
        cbk[1](err);
      } else {
        cbk[0]();
      }
    }
    delete this.queue;
  }

  async onMessage(message: string): Promise<void> {
    const clock = this.clock;
    if (!clock) throw new Error('Have no clock');

    const pending = await this.storage.get('__pending__');
    let updates: Array<string> = JSON.parse(pending || '[]');

    for (const op of new Frame(message)) {
      if (op.event.origin === clock.origin()) {
        for (let i = updates.length - 1; i >= 0; i--) {
          const update = Op.fromString(updates[i]);
          if (update && op.event.lt(update.event)) continue;
          updates = updates.slice(i);
          i = -1;
        }
      }
    }
    await this.storage.set('__pending__', JSON.stringify(updates));
    await this.update(message);
  }

  /**
   * On installs subscriptions.
   */
  async on(query: string, callback: ?(frame: string, state: string) => void): Promise<void> {
    const fwd = new Frame();
    const self = this;
    for (let op of new Frame(query)) {
      if (op.uuid(1).eq(ZERO)) throw new Error(`ID is not specified: "${op.toString()}"`);
      const key = op.uuid(1).toString();
      let base = ZERO;
      const stored = await self.storage.get(key);
      if (stored) {
        for (const op of new Frame(stored)) {
          base = op.event;
          break;
        }
      }
      fwd.push(new Op(op.type, op.object, base, ZERO, '', QUERY_SEP + FRAME_SEP)); // FIXME check fork mode
      if (callback) {
        if (self.lstn[key]) throw new Error('TODO: many listeners per obj');
        self.lstn[key] = callback;
      }
    }

    self.upstream.send(fwd.toString());
    if (callback && fwd.toString()) await self.update(fwd.toString(), true);
  }

  /**
   * Off removes subscriptions.
   */
  off(query: string, callback: ?(frame: string, state: string) => void) {
    const fwd = new Frame();
    for (const op of new Frame(query)) {
      delete this.lstn[op.uuid(1).toString()];
      fwd.push(new Op(op.type, op.object, NEVER, ZERO));
    }
    this.upstream.send(fwd.toString());
  }

  /**
   * Push sends updates to remote and local storages.
   * Waits for connection installed. Thus, the client works in
   * read-only mode until installed connection.
   */
  async push(rawFrame: string) {
    await this.ensure();
    let stamps: {[string]: UUID | void} = {};

    const frame = mapUUIDs(rawFrame, (uuid, position, _, op): UUID => {
      if (position === 0) return uuid.eq(ZERO) ? lww.type : uuid;
      if (position > 2 || !uuid.eq(ZERO)) return uuid;
      const exists = stamps[uuid.toString()];
      // $FlowFixMe
      return exists ? exists : (stamps[uuid.toString()] = this.clock.time());
    });

    // save
    const pending = await this.storage.get('__pending__');
    await this.storage.set('__pending__', JSON.stringify(JSON.parse(pending || '[]').concat(frame)));
    await this.update(frame);
    this.upstream.send(frame);
  }

  /**
   * Update updates local states and notifies listeners.
   */
  async update(frame: string, skipMerge: ?true): Promise<void> {
    const self = this;
    for (const op of new Frame(frame)) {
      const key = op.uuid(1).toString();
      let state = await self.storage.get(key);
      if (!skipMerge) {
        state = state ? reduce(Batch.fromStringArray(state.toString(), frame)).toString() : frame;
        await self.storage.set(key, state);
      }
      const l = self.lstn[key];
      if (l && state) {
        l(!skipMerge ? frame : '', state.toString());
      }
      break; // read only first operation of given frame
    }
  }
}

// DevNull connection is used for permanent offline-mode
class DevNull implements Connection {
  onmessage: (ev: MessageEvent) => any;
  onopen: (ev: Event) => any;
  readyState: number;
  constructor() {
    this.readyState = 3;
    setTimeout(() => this.onopen(new Event('')), 0);
  }
  send(data: string): void {}
}

function panic(err: any) {
  throw err;
}
