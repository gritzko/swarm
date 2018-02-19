/* @flow */

import regeneratorRuntime from 'regenerator-runtime'; // for async/await work flow

import RWS from 'reconnectable-websocket';

import Op, {Batch, Frame, Cursor, UUID, QUERY_SEP, FRAME_SEP, mapUUIDs, js2ron} from 'swarm-ron';
import type {Atom} from 'swarm-ron';
import type {Clock} from 'swarm-clock';
import {Logical, Calendar} from 'swarm-clock';
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
  id?: string,
  name: string,
  clockMode?: 'Logical' | 'Epoch' | 'Calendar',
  clockLen?: number,
  forkMode?: string,
  peerIdBits?: number,
  horizont?: number,
  auth?: string,
  seen?: string,
  offset?: number,
};

export type Options = {
  storage: Storage,
  upstream?: string | Connection,
  hsTimeout?: number,
  db?: Meta,
};

const defaultMeta: Meta = {
  name: 'default',
  // FIXME clockMode: 'Calendar',
  clockLen: 5,
  forkMode: '// FIXME', // keep possible values sync with server
  peerIdBits: 30,
  horizont: 604800, // one week in seconds
  offset: 0,
};

// A simple client. Consumes updates from the server,
// feeds resulting RON states back to the listeners.
export default class Client {
  clock: ?Clock;
  lstn: {[key: string]: Array<(frame: string, state: string) => void>}; // ?
  upstream: Connection;
  storage: Storage;
  queue: Array<[() => void, (err: Error) => void]> | void;
  db: Meta;
  options: {
    hsTimeout: number,
  };

  constructor(options: Options) {
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
    //
  }

  async init(options: Options) {
    try {
      const meta = await this.storage.get('__meta__');
      this.db = ({
        ...this.db,
        ...JSON.parse(meta || '{}'),
      }: Meta);

      if (this.db.clockMode && this.db.id) {
        switch (this.db.clockMode) {
          case 'Logical':
            this.clock = new Logical(this.db.id);
            break;
          case 'Calendar':
            this.clock = new Calendar(this.db.id, {offset: this.db.offset || 0});
            break;
          default:
            throw new Error(`TODO: Clock mode '${this.db.clockMode}' is not supported yet`);
        }
      }
      await this.storage.set('__meta__', JSON.stringify(this.db));

      if (typeof options.upstream === 'string') {
        this.upstream = new RWS(options.upstream, undefined, {reconnectOnError: true});
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
      this.release((e: Error));
    }
  }

  async handshake(): Promise<void> {
    if (this.upstream instanceof DevNull) return;

    const hs = new Promise((resolve, reject) => {
      setTimeout(reject, this.options.hsTimeout);
      this.upstream.onmessage = (me: MessageEvent) => resolve(((me.data: any): string));
    });

    const hello = new Frame();
    const head = new Op(
      new UUID('db', '0', '$'),
      new UUID(this.db.name, '0', '$'),
      new UUID(this.clock ? this.clock.last().value : '0', this.db.id || '0', '+'),
      ZERO,
      undefined,
      QUERY_SEP,
    );
    hello.push(head);
    hello.pushWithTerm(head, FRAME_SEP);

    const {auth} = this.db;
    if (auth) {
      hello.push(new Op(head.uuid(0), head.uuid(1), head.uuid(2), head.uuid(3), js2ron([auth]), ','));
    }
    this.upstream.send(hello.toString());

    const resp = await hs;

    const dbOpts: Meta = {
      clockMode: 'Calendar',
      ...this.db,
    };

    let seen: UUID = ZERO;
    for (const op of new Frame(resp)) {
      if (seen.eq(ZERO)) {
        seen = op.uuid(2);
      }
      const val = op.value(0);
      if (val) {
        let key = op.uuid(3).toString();
        key = key[0].toLowerCase() + key.slice(1);
        dbOpts[key] = val instanceof UUID ? val.value : val;
      }
    }

    // *db #test$user @1ABC+server!
    //           └──┘
    //             ^
    // read replica id assigned by the server
    const op = Op.fromString(resp);
    if (op) {
      dbOpts.id = op.uuid(1).origin;
    } else {
      throw new Error(`Expected replica id not found in the handshake response: \n\t'${(op || '').toString()}'`);
    }

    if (this.clock) {
      if (this.db.clockMode !== dbOpts.clockMode)
        throw new Error(
          `Different clock mode: '${this.db.clockMode || 'undefined'}' !== '${dbOpts.clockMode || 'undefined'}'`,
        );
    } else if (dbOpts.id) {
      switch (dbOpts.clockMode) {
        case 'Logical':
          this.clock = new Logical(dbOpts.id);
          break;
        case 'Calendar':
          this.clock = new Calendar(dbOpts.id, {offset: dbOpts.offset || 0});
          // TODO check the difference and apply offset if needed
          break;
        default:
          throw new Error(`Clock mode '${dbOpts.clockMode || 'undefined'}' is not supported yet`);
      }
    } else {
      throw new Error(`Clock mode '${dbOpts.clockMode || 'undefined'}' is not supported yet`);
    }

    this.clock.see(seen);

    this.db = {...this.db, ...dbOpts};
    await this.storage.set('__meta__', JSON.stringify(this.db));
    this.upstream.onmessage = (me: MessageEvent) => this.onMessage(((me.data: any): string)).catch(panic);
    this.upstream.onopen = () => this.handshake().catch(panic);

    // resend all the frames
    const pending = await this.storage.get('__pending__');
    for (const frame: string of JSON.parse(pending || '[]')) {
      this.upstream.send(frame);
    }

    // resubscribe
    let query: Array<string> = Object.keys(this.lstn);
    if (query.length) await this.on('#' + query.join('#'));
  }

  // Ensure returns Promise which will be resolved after connection
  // installed or rejected if an error occurred.
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

    for (const op of new Frame(message)) {
      clock.see(op.event);
      if (op.event.origin === clock.origin()) {
        const pending = await this.storage.get('__pending__');
        let updates: Array<string> = JSON.parse(pending || '[]');

        let i = -1;
        for (const _old of updates) {
          i++;
          const old = Op.fromString(_old);
          if (!old) throw new Error(`malformed op: '${_old}'`);

          if (old.event.gt(op.event)) {
            updates = updates.slice(i + 1);
            break;
          }
        }
        if (i === updates.length - 1) updates = [];
        await this.storage.set('__pending__', JSON.stringify(updates));
      }
      break;
    }
    await this.update(message);
  }

  // On installs subscriptions.
  async on(query: string, callback: ?(frame: string, state: string) => void): Promise<boolean> {
    const fwd = new Frame();
    for (let op of new Frame(query)) {
      if (op.uuid(1).eq(ZERO)) throw new Error(`ID is not specified: "${op.toString()}"`);
      const key = op.uuid(1).toString();
      let base = ZERO;
      const stored = await this.storage.get(key);
      if (stored) {
        for (const op of new Frame(stored)) {
          base = op.event;
          break;
        }
      }
      let found = false;
      if (callback) {
        for (const l of this.lstn[key] || []) {
          found = found || l === callback;
        }
        if (!found) {
          this.lstn[key] = (this.lstn[key] || []).concat(callback);
        }
      }
      if (!found) {
        fwd.push(new Op(op.type, op.object, base, ZERO, '', QUERY_SEP + FRAME_SEP)); // FIXME check fork mode
      }
    }

    if (this.upstream && this.clock && fwd.toString()) {
      this.upstream.send(fwd.toString());
    }
    if (callback && fwd.toString()) {
      await this.update(fwd.toString(), true);
    }
    return !!fwd.toString();
  }

  // Off removes subscriptions.
  off(q: string | void, callback: ?(frame: string, state: string) => void): string | void {
    // unless query passed fetch all the keys to unsubscribe from them
    const query: string =
      q ||
      Object.keys(this.lstn)
        .map(i => '#' + i)
        .join(';');
    const fwd = new Frame();
    for (const op of new Frame(query)) {
      const key = op.uuid(1).toString();
      this.lstn[key] = this.lstn[key] || [];
      if (callback) {
        let i = -1;
        for (const cbk of this.lstn[key]) {
          i++;
          if (cbk === callback) this.lstn[key].splice(i, 1);
        }
        if (!this.lstn[key].length) {
          fwd.push(new Op(op.type, op.object, NEVER, ZERO));
        }
      } else {
        delete this.lstn[key];
        fwd.push(new Op(op.type, op.object, NEVER, ZERO));
      }
    }
    if (fwd.toString()) {
      this.upstream.send(fwd.toString());
      return fwd.toString();
    }
    return;
  }

  // Push sends updates to remote and local storages.
  // Waits for connection installed. Thus, the client works in
  // read-only mode until installed connection.
  async push(rawFrame: string): Promise<void> {
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
    this.upstream.send(frame);
    await this.update(frame);
  }

  // Update updates local states and notifies listeners.
  async update(frame: string, skipMerge: ?true): Promise<void> {
    const fr = new Frame(frame);
    for (const op of fr) {
      const key = op.uuid(1).toString();
      let state = await this.storage.get(key);
      if (!skipMerge) {
        state =
          state && fr.isPayload()
            ? reduce(Batch.fromStringArray(state, frame)).toString()
            : fr.isPayload() ? frame : null;
        if (state) await this.storage.set(key, state);
      }
      if (state) {
        for (const l of this.lstn[key] || []) {
          l(!skipMerge ? frame : '', state.toString());
        }
      }
      // read only first operation of the frame
      break;
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
