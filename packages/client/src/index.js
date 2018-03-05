/* @flow */

import regeneratorRuntime from 'regenerator-runtime'; // for async/await work flow

import RWS from './rws';

import Op, {Batch, Frame, Cursor, UUID, QUERY_SEP, FRAME_SEP, mapUUIDs, js2ron} from 'swarm-ron';
import type {Atom} from 'swarm-ron';
import type {Clock} from 'swarm-clock';
import {Logical, Calendar} from 'swarm-clock';
import {ZERO, NEVER} from 'swarm-ron-uuid';
import {lww} from 'swarm-rdt';
import {reduce} from 'swarm-rdt';
import type {Storage} from './storage';
import {InMemory} from './storage';

export {default as WebSocket} from './rws';
export {InMemory, LocalStorage} from './storage';

export interface Connection {
  onmessage: (ev: MessageEvent) => any;
  onopen: (ev: Event) => any;
  send(data: string): void;
  readyState: number;
  close(): void;
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
  fetchTimeout?: number,
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
    fetchTimeout: number,
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
      fetchTimeout: options.fetchTimeout || 3e4 /* 30sec */,
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
        if (op.uuid(3).isError()) {
          this.close();
          throw new Error(op.uuid(3).toString());
        }
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
    if (query.length) {
      await this.on('#' + query.join('#'));
    }
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

  close(): void {
    if (this.upstream) this.upstream.close();
  }

  async onMessage(message: string): Promise<void> {
    const clock = this.clock;
    if (!clock) throw new Error('Have no clock');

    let c = -1;
    for (const op of new Frame(message)) {
      c++;
      // check if it's an error from the server
      if (c === 0 && op.uuid(0).toString() === 'db') {
        this.close();
        throw new Error(op.uuid(3).toString());
      }
      // skip milformed NEVERs explisitly
      // waitign for a fix at server side
      if (!op.event.eq(NEVER)) {
        clock.see(op.event);
      }

      // operate over pending messages
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

    // go further and merge payload if prev
    // checks were passed
    //
    // merge method also accepts acks:
    //    notifies listeners with null payload
    //    if there is no saved state
    await this.merge(message, {local: false});
  }

  // On installs subscriptions.
  async on(query: string, callback: ?(frame: string, state: string) => void): Promise<boolean> {
    const fwd = new Frame();
    const upstrm = new Frame();
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
      let exists = !!callback && !!this.lstn[key] && this.lstn[key].length;
      if (callback) {
        for (const l of this.lstn[key] || []) {
          found = found || l === callback;
        }
        if (!found) {
          this.lstn[key] = (this.lstn[key] || []).concat(callback);
        }
      }

      if (!found) {
        if (!exists && !op.object.isLocal()) {
          upstrm.push(new Op(op.type, op.object, base, ZERO, '', QUERY_SEP + FRAME_SEP)); // FIXME check fork mode
        }
        fwd.push(new Op(op.type, op.object, base, ZERO, '', QUERY_SEP + FRAME_SEP)); // FIXME check fork mode
      }
    }

    if (this.upstream && this.clock && upstrm.toString()) {
      this.upstream.send(upstrm.toString());
    }
    if (callback && fwd.toString()) {
      await this.notify(fwd.toString());
    }
    return !!fwd.toString();
  }

  // Once accepts only single ID and sends full state.
  async once(query: string): Promise<string> {
    for (const op of new Frame(query)) {
      const state = await new Promise(async (r, rej) => {
        const key = `#${op.uuid(1).toString()}`;
        const once = (f: string, s: string): void => {
          this.off(key, once);
          r(s);
        };
        setTimeout(() => {
          this.off(key, once);
          rej(new Error(`Time is out while fetching '#${key}'.`));
        }, this.options.fetchTimeout);
        await this.on(key, once);
      });
      return state;
    }
    throw new Error('ID not found in: ' + query);
  }

  // Off removes subscriptions.
  off(q: string | void, callback: ?(frame: string, state: string) => void): string | void {
    // unless query passed fetch all the keys to unsubscribe from them
    const query: string =
      q ||
      Object.keys(this.lstn)
        .map(i => '#' + i)
        .join('');
    let c = 0;
    const fwd = new Frame();
    fwd.push(new Op(ZERO, ZERO, NEVER, ZERO, undefined, QUERY_SEP));

    for (const op of new Frame(query)) {
      const key = op.uuid(1).toString();
      this.lstn[key] = this.lstn[key] || [];
      if (callback) {
        let i = -1;
        for (const cbk of this.lstn[key]) {
          i++;
          if (cbk === callback) {
            this.lstn[key].splice(i, 1);
          }
        }
        if (!this.lstn[key].length) {
          if (!op.uuid(1).isLocal()) {
            fwd.push(new Op(op.type, op.object, NEVER, ZERO, undefined, ','));
            c++;
          }
        }
      } else {
        delete this.lstn[key];
        if (!op.uuid(1).isLocal()) {
          fwd.push(new Op(op.type, op.object, NEVER, ZERO, undefined, ','));
          c++;
        }
      }
    }
    if (!!c) {
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
    const filtered = new Frame(frame).filter(op => !op.uuid(1).isLocal()).toString();
    if (filtered) this.upstream.send(filtered);
    await this.merge(frame, {local: true});
  }

  // Notify sends local states to all the listeners in the given frame
  async notify(frame: string): Promise<void> {
    const keys: string[] = [];
    for (const op of new Frame(frame)) keys.push(op.uuid(1).toString());
    const store = await this.storage.multiGet(keys);
    for (const key of keys) {
      const state = store[key];
      // check if the value exists even empty string
      if (state != null) {
        for (const l of this.lstn[key] || []) l('#' + key, state);
      }
    }
  }

  // Merge updates local states and notifies listeners.
  // Accepts acks messsages.
  //    notifies listeners with empty payload(once)
  //    if there is no saved state
  async merge(frame: string, options: {local: boolean} = {local: true}): Promise<void> {
    const fr = new Frame(frame);
    for (const op of fr) {
      const key = op.uuid(1).toString();
      let state = await this.storage.get(key);
      const prev = state;

      if (fr.isPayload()) {
        if (typeof state === 'string') {
          state = reduce(Batch.fromStringArray(key, state, frame)).toString();
        } else {
          state = frame;
        }
      } else {
        if (state) {
          // It's ack, do nothing.
          // Pendings were reduced in onMessage method
          return;
        } else {
          // Empty state from server, object does not exists.
          // Notify with empty state, set empty string as state.
          state = '';
        }
      }

      // ensure that it's an update(don't repeat)
      if (prev !== state) {
        await this.storage.set(key, state);
        for (const l of this.lstn[key] || []) {
          l('#' + key, state.toString());
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
  close(): void {}
}

function panic(err: any) {
  throw err;
}
