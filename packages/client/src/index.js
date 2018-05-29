/* @flow */

import regeneratorRuntime from 'regenerator-runtime'; // for async/await work flow

import RWS from './rws';

import Op, {
  Batch,
  Frame,
  Cursor,
  UUID,
  QUERY_SEP,
  FRAME_SEP,
  mapUUIDs,
  js2ron,
} from '@swarm/ron';
import type { Atom } from '@swarm/ron';
import type { Clock } from '@swarm/clock';
import { Logical, Calendar } from '@swarm/clock';
import { ZERO, NEVER, LOCAL } from '@swarm/ron-uuid';
import { lww } from '@swarm/rdt';
import { reduce } from '@swarm/rdt';
import type { Storage } from './storage';
import { InMemory } from './storage';
import type { Connection } from './connection';
import Pending from './pending';

export { default as WebSocket } from './rws';
export { InMemory, LocalStorage } from './storage';
export type { Connection } from './connection';
import { DevNull } from './connection';

export type Meta = {
  id?: string,
  name: string,
  clockMode?: 'Logical' | 'Calendar',
  clockLen?: number,
  forkMode?: string,
  peerIdBits?: number,
  horizont?: number,
  auth?: string,
  seen?: string,
  offset?: number,
  '0'?: number,
};

export type Options = {
  storage: Storage,
  upstream?: string | Connection,
  hsTimeout?: number,
  fetchTimeout?: number,
  resendAfter?: number,
  db?: Meta,
};

type callback = {
  f: (frame: string, state: string | null) => void,
  once?: true,
  ensure?: true,
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

const SEEN = '0';
const META = '__meta__';

// A bare-bone swarm client. Consumes updates from the server,
// feeds resulting RON states back to the listeners.
export default class Client {
  clock: ?Clock;
  lstn: { [key: string]: Array<callback> };
  upstream: Connection;
  storage: Storage;
  queue: Array<[() => void, (err: Error) => void]> | void;
  db: Meta;
  options: {
    hsTimeout: number,
    fetchTimeout: number,
    resendAfter: number,
  };
  pending: Pending;
  seen: UUID;

  constructor(options: Options): Client {
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
      resendAfter: options.resendAfter || 0,
    };
    this.init(options);
    this.seen = ZERO;
    return this;
  }

  async init(options: Options) {
    try {
      const { [META]: meta, [SEEN]: seen } = await this.storage.multiGet([
        META,
        SEEN,
      ]);
      const last = seen ? UUID.fromString(seen) : ZERO;

      this.db = ({
        ...this.db,
        ...JSON.parse(meta || '{}'),
      }: Meta);

      if (this.db.clockMode && this.db.id) {
        switch (this.db.clockMode) {
          case 'Logical':
            this.clock = new Logical(this.db.id, {
              length: this.db.clockLen,
              last,
            });
            break;
          case 'Calendar':
            this.clock = new Calendar(this.db.id, {
              offset: this.db.offset || 0,
              length: this.db.clockLen,
              last,
            });
            break;
          default:
            throw new Error(
              `TODO: Clock mode '${this.db.clockMode}' is not supported yet`,
            );
        }
        this.seen = last;
      }

      if (typeof options.upstream === 'string') {
        this.upstream = new RWS(options.upstream, undefined, {
          reconnectOnError: true,
        });
      } else if (options.upstream) {
        this.upstream = options.upstream;
      } else if (!options.upstream && this.db.clockMode) {
        this.upstream = new DevNull();
      } else if (!options.upstream && !this.db.clockMode) {
        throw new Error('neither connection options nor clock options found');
      }

      this.pending = await Pending.read(this.storage);

      // check if we start with an already existing replica
      if (meta && this.clock) {
        this.upstream.onopen = () =>
          this.handshake().catch(async e => {
            await this.close();
            this.panic(e);
          });
        this.release(null);
      } else {
        this.upstream.onopen = () =>
          this.handshake()
            .then(() => this.release(null))
            .catch(async e => {
              await this.close();
              this.release((e: Error));
            });
      }
    } catch (e) {
      this.release((e: Error));
    }
  }

  async handshake(): Promise<void> {
    if (this.upstream instanceof DevNull) {
      await this.storage.set(META, JSON.stringify(this.db));
      this.upstream.onmessage = (me: MessageEvent) => {
        this.onMessage(((me.data: any): string)).catch(this.panic);
      };
      return;
    }

    const hs = new Promise((resolve, reject) => {
      setTimeout(reject, this.options.hsTimeout);
      this.upstream.onmessage = (me: MessageEvent) =>
        resolve(((me.data: any): string));
    });

    const hello = new Frame();
    const head = new Op(
      new UUID('db', '0', '$'),
      new UUID(this.db.name, '0', '$'),
      new UUID(this.seen.value, this.db.id || '0', '+'),
      ZERO,
      undefined,
      QUERY_SEP,
    );
    hello.push(head);
    hello.pushWithTerm(head, FRAME_SEP);

    const { auth } = this.db;
    if (auth) {
      hello.push(
        new Op(
          head.uuid(0),
          head.uuid(1),
          head.uuid(2),
          head.uuid(3),
          js2ron([auth]),
          ',',
        ),
      );
    }
    this.upstream.send(hello.toString());

    const resp = await hs;

    const dbOpts: Meta = {
      clockMode: 'Calendar',
      ...this.db,
    };

    let seen: UUID = ZERO;
    for (const op of new Frame(resp)) {
      if (op.uuid(3).isError()) {
        this.close();
        throw new Error(`Handshake error: ${op.uuid(3).toString()}`);
      }
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

    const op = Op.fromString(resp);
    if (op) {
      dbOpts.id = op.uuid(1).origin;
    } else {
      throw new Error(
        `Expected replica id not found in a handshake response: \n\t'${(
          op || ''
        ).toString()}'`,
      );
    }

    if (this.clock) {
      if (this.db.clockMode !== dbOpts.clockMode)
        throw new Error(
          `Different clock mode: '${this.db.clockMode ||
            'undefined'}' !== '${dbOpts.clockMode || 'undefined'}'`,
        );
    } else if (dbOpts.id) {
      switch (dbOpts.clockMode) {
        case 'Logical':
          this.clock = new Logical(dbOpts.id, { length: dbOpts.clockLen });
          break;
        case 'Calendar':
          this.clock = new Calendar(dbOpts.id, { length: dbOpts.clockLen });
          break;
        default:
          throw new Error(
            `Clock mode '${dbOpts.clockMode ||
              'undefined'}' is not supported yet`,
          );
      }
    } else {
      throw new Error(
        `Clock mode '${dbOpts.clockMode || 'undefined'}' is not supported yet`,
      );
    }

    dbOpts.offset = this.clock.adjust(dbOpts['0'] || seen);
    delete dbOpts['0'];

    this.db = { ...this.db, ...dbOpts };
    await this.storage.set(META, JSON.stringify(this.db));
    this.upstream.onmessage = (me: MessageEvent) =>
      this.onMessage(((me.data: any): string)).catch(this.panic);
    this.upstream.onopen = () => this.handshake().catch(this.panic);

    const { resendAfter } = this.options;
    if (resendAfter) {
      this.pending.onIdle(this.onIdle);
      this.pending.setIdlePeriod(resendAfter);
    } else {
      // Resend all the frames
      for (const p of this.pending) this.upstream.send(p);
    }

    // Re-subscribe
    let query: Array<string> = Object.keys(this.lstn);
    if (query.length) {
      await this.on('#' + query.join('#'));
    }
  }

  // Ensure returns Promise which will be resolved after connection
  // installed or rejected if an error occurred.
  async ensure(): Promise<void> {
    const { queue } = this;
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

  async close(): Promise<void> {
    if (this.upstream) this.upstream.close();
    this.pending.onIdle(() => {});
    this.pending.setIdlePeriod(0);
    await this.pending.flush();
  }

  open(): void {
    if (this.upstream) {
      this.upstream.open();
    }
  }

  async onMessage(message: string): Promise<void> {
    const { clock } = this;
    if (!clock) throw new Error('Have no clock');

    for (const op of new Frame(message)) {
      // check if it's an error from the server
      if (op.uuid(0).toString() === 'db') {
        this.close();
        // TODO destroy replica ?
        throw new Error(op.toString());
      }

      // skip malformed NEVERs explicitly
      // waiting for the fix at server side
      if (!op.event.eq(NEVER)) {
        await this.see(op.event);
        // handle ack
        if (op.event.origin === clock.origin()) {
          const seen = await this.pending.release(op.event);
        }
      }

      break;
    }

    for (const f of Batch.splitByID(message))
      await this.merge(f.toString(), { local: false });
  }

  // On installs subscriptions.
  async on(
    query: string,
    callback: ?(frame: string, state: string | null) => void,
    options: { once?: true, ensure?: true } = {},
  ): Promise<boolean> {
    await this.ensure();
    const fwd = new Frame();
    const upstrm = new Frame();
    const wrapped = { f: callback, ...options };
    let onceSent = 0;

    const keys = new Frame(query).unzip().map(op => {
      if (op.uuid(1).eq(ZERO))
        throw new Error(`ID is not specified: "${op.toString()}"`);
      return op.uuid(1).toString();
    });

    const data = await this.storage.multiGet(keys.concat('0'));

    for (const key of keys) {
      const id = UUID.fromString(key);
      let base = ZERO;
      const stored = data[key];

      // try to avoid network request
      if (callback && wrapped.once && (stored !== null || !wrapped.ensure)) {
        callback('#' + key, stored);
        onceSent++;
      } else {
        if (stored) {
          for (const op of new Frame(stored)) {
            base = op.event.lt(this.seen) ? op.event : this.seen;
            // base = op.event;
            break;
          }
        }

        let found = false;
        let exists = !!callback && !!this.lstn[key] && this.lstn[key].length;

        if (wrapped.f) {
          for (const l of this.lstn[key] || []) {
            found = found || l.f === wrapped.f;
          }

          if (!found) {
            // $FlowFixMe
            this.lstn[key] = (this.lstn[key] || []).concat([wrapped]);
          }
        }

        if (!found) {
          if (!exists && !id.isLocal()) {
            upstrm.push(
              new Op(ZERO, id, base, ZERO, '', QUERY_SEP + FRAME_SEP),
            ); // FIXME check fork mode
          }
          fwd.push(new Op(ZERO, id, base, ZERO, '', QUERY_SEP + FRAME_SEP)); // FIXME check fork mode
        }
      }
    }

    if (this.upstream && this.clock && upstrm.toString()) {
      this.upstream.send(upstrm.toString());
    }

    if (callback && fwd.toString()) {
      await this.notify(fwd.toString(), wrapped);
    }

    return !!fwd.toString() || !!onceSent;
  }

  // Off removes subscriptions.
  off(
    q: string | void,
    callback: ?(frame: string, state: string | null) => void,
  ): string | void {
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
      if (!this.lstn[key]) continue;
      if (callback) {
        this.lstn[key] = this.lstn[key].filter(cbk => cbk.f !== callback);
        if (!this.lstn[key].length) {
          if (!op.uuid(1).isLocal()) {
            fwd.push(new Op(op.type, op.object, NEVER, ZERO, undefined, ','));
            c++;
          }
          delete this.lstn[key];
        }
      } else {
        if (!op.uuid(1).isLocal()) {
          fwd.push(new Op(op.type, op.object, NEVER, ZERO, undefined, ','));
          c++;
        }
        delete this.lstn[key];
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
    let stamps: { [string]: UUID | void } = {};

    const frame = mapUUIDs(rawFrame, (uuid, position): UUID => {
      if (position === 0) return uuid.eq(ZERO) ? lww.type : uuid;
      if (position > 2 || !uuid.eq(ZERO)) return uuid;
      const exists = stamps[uuid.toString()];
      // $FlowFixMe
      return exists ? exists : (stamps[uuid.toString()] = this.clock.time());
    });

    const filtered = new Frame(frame)
      .filter(op => !op.uuid(1).isLocal())
      .toString();
    if (filtered) {
      await this.pending.push(filtered);
      this.upstream.send(filtered);
    }
    await this.merge(frame, { local: true });
  }

  // Notify calls back with an existing states
  async notify(
    frame: string,
    callback: {
      f: ?(frame: string, state: string | null) => void,
      once?: true,
      ensure?: true,
    },
  ): Promise<void> {
    if (!callback.f) return;
    const keys: { [string]: true } = {};
    for (const op of new Frame(frame)) keys[op.uuid(1).toString()] = true;
    const ks = Object.keys(keys);
    const store = await this.storage.multiGet(ks);
    for (const key of ks) {
      const value = store[key];
      const isLocal = key.slice(key.length - LOCAL.length) === LOCAL;
      if (!callback.ensure || value !== null || isLocal) {
        if (callback.once) this.off('#' + key, callback.f);
        // $FlowFixMe
        callback.f('#' + key, isLocal ? value || '' : value);
      }
    }
  }

  // Merge updates local state and notifies listeners.
  // Accepts single frame.
  //    notifies listeners with empty payload
  //    if there is no saved state
  async merge(
    frame: string,
    options: { local: boolean } = { local: true },
  ): Promise<void> {
    const fr = new Frame(frame);

    // Read only first operation of the frame
    // but with guarantee.
    for (const op of fr) {
      const key = op.uuid(1).toString();
      if (key === '0') return; // ack

      let notify: boolean = false;

      const updated = await this.storage.merge(key, (prev: string | null) => {
        if (fr.isPayload()) {
          if (typeof prev === 'string') {
            const update = reduce(
              Batch.fromStringArray(prev, frame),
            ).toString();
            notify = prev !== update;
            return update;
          }
          notify = true;
          return frame;
        }

        // An empty state from the server whereas a local state is full
        if (prev !== null) {
          return prev;
        }

        // Empty state from a server, hence, an object does not exist in the system.
        notify = true;
        return '';
      });

      if (notify) {
        // Copy an array to be able to unsubscribe before calling back
        for (const l of (this.lstn[key] || []).slice()) {
          if (!l.ensure || updated !== null) {
            if (l.once) this.off('#' + key, l.f);
            l.f('#' + key, updated);
          }
        }
      }
      break;
    }
  }

  panic = (err: any): void => {
    console.error('panic: %s', err);
  };

  onIdle = () => {
    // Resend all the frames
    for (const p of this.pending) this.upstream.send(p);
  };

  async see(event: UUID): Promise<UUID> {
    const { clock } = this;
    if (clock && clock.see(event)) {
      this.seen = event;
      await this.storage.set(SEEN, event.toString());
    }
    return event;
  }
}
