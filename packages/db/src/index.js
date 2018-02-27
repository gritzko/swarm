// @flow

import type {DocumentNode} from 'graphql';
import graphql from 'graphql-anywhere';
import hash from 'object-hash';

import {lww, set, ron2js} from 'swarm-rdt';
import Op, {Frame} from 'swarm-ron';
import UUID, {ZERO} from 'swarm-ron-uuid';
import API, {getOff} from 'swarm-api';
import type {Options, Value} from 'swarm-api';
import type {Atom} from 'swarm-ron';

export type Response = {
  data: Value,
  off?: () => boolean,
  error?: Error,
};

export type Request = {
  gql: DocumentNode,
  args?: {[string]: Atom},
};

const directives = {
  [set.type.toString()]: ['length', 'slice'],
  [lww.type.toString()]: [],
};

type callable = () => boolean;

interface Swarm {
  execute(request: Request, cbk?: (Response) => void): Promise<{ok: boolean, off?: () => boolean}>;
  uuid(): UUID;
  ensure(): Promise<void>;
}

export default class SwarmDB extends API implements Swarm {
  constructor(options: Options): Swarm {
    super(options);
    return this;
  }

  async execute(request: Request, cbk?: Response => void): Promise<{ok: boolean, off?: () => boolean}> {
    const h = GQLSub.hash(request, cbk);
    for (const s of this.subs) {
      if (s.is(h)) return {ok: false};
    }

    if (request.gql.definitions.length !== 1) {
      throw new Error(`unexpected length of definitions: ${request.gql.definitions.length}`);
    }

    await this.ensure();
    const sub = new GQLSub(this.client, this.cache, request, cbk);
    this.subs.push(sub);
    sub.finalize((h: string) => {
      let c = -1;
      for (const s of this.subs) {
        c++;
        if (s.is(h)) {
          this.subs.splice(c, 1);
          break;
        }
      }
    });
    const ok = await sub.start();
    return {
      ok,
      off: () => sub.off(),
    };
  }
}

interface IClient {
  on(id: string, cbk: (string, string) => void): Promise<boolean>;
  off(id: string, cbk: (string, string) => void): string | void;
}

class GQLSub {
  cache: {[string]: {[string]: Atom}};
  client: IClient;
  finalizer: ((h: string) => void) | void;
  prev: string;
  cbk: (Response => void) | void;
  keys: {[string]: true};
  active: boolean | void;
  request: Request;
  id: string; // hash from payload object

  operation: 'query' | 'mutation' | 'subscription';

  constructor(client: IClient, cache: {[string]: {[string]: Atom}}, request: Request, cbk?: Response => void): GQLSub {
    this.request = request;
    this.id = GQLSub.hash(request, cbk);
    // $FlowFixMe
    this.operation = request.gql.definitions[0].operation;

    this.client = client;
    this.cache = cache;
    this.cbk = cbk;

    // $FlowFixMe
    this._invoke = this._invoke.bind(this);
    return this;
  }

  is(h: string): boolean {
    return this.id === h;
  }

  off(): boolean {
    if (this.active === true) {
      const ret = (this.active = !!this.client.off(this.prev, this._invoke));
      this.finalizer && this.finalizer(this.id);
      return ret;
    }
    return false;
  }

  finalize(f: (h: string) => void): void {
    this.finalizer = f;
  }

  async start(): Promise<boolean> {
    if (this.active !== undefined) return false;
    switch (this.operation) {
      case 'query':
      case 'subscription':
        const {ids, frame} = this.buildTree();
        this.prev = frame.toString();
        this.keys = ids;
        if (frame.toString()) {
          this.active = await this.client.on((this.prev = frame.toString()), this._invoke);
        } else this.active = true;
        break;
      case 'mutation':
        // TODO
        break;
      default:
        throw new Error(`unknown operation: '${this.operation}'`);
    }
    return this.active || false;
  }

  _invoke(l: string, s: string): void {
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
    const {ids, frame, tree} = this.buildTree();

    if (this.prev !== frame.toString()) {
      this.keys = ids;
      this.client.on(frame.toString(), this._invoke);

      // get the difference and unsubscribe from lost refs
      const off = getOff(ids, this.prev);
      if (off) {
        this.client.off(off, this._invoke);
      }
      this.prev = frame.toString();
    }

    if (this.cbk) {
      if (this.operation !== 'subscription') {
        // drop this sub from
        this.off();
        this.cbk && this.cbk({data: tree});
      } else {
        this.cbk({
          data: tree,
          off: () => this.off(),
        });
      }
    }
  }

  buildTree(): {frame: Frame, tree: Value, ids: {[string]: true}} {
    const ids: {[string]: true} = {};
    const tree = graphql(this.resolver.bind(this), this.request.gql, {}, ids, this.request.args);

    const keys = Object.keys(ids);
    if (keys.length) {
      return {
        frame: new Frame('#' + keys.join('#')),
        ids,
        tree,
      };
    }
    return {frame: new Frame(), ids, tree};
  }

  resolver(
    fieldName: string,
    root: {[string]: Atom},
    args: {[string]: Atom},
    context: {[string]: true},
    info: {directives: {[string]: {[string]: Atom}} | void},
  ): mixed {
    if (root instanceof UUID) return null;

    // workaround __typename
    if (fieldName === '__typename') fieldName = 'type';

    let value: Atom = root[fieldName];
    if (typeof value === 'undefined') value = null;

    // get UUID from @node directive if presented
    // thus, override the value
    if (info.directives && info.directives.node) {
      value =
        info.directives.node.id instanceof UUID
          ? info.directives.node.id
          : // $FlowFixMe
            UUID.fromString('' + info.directives.node.id);
    }

    // if atom value is not a UUID, then just return w/o
    // any additional business logic
    if (!(value instanceof UUID)) return value;

    // the value is UUID
    // keep it in the context
    context[value.toString()] = true;

    // try to fetch an object from the cache
    // $FlowFixMe
    let obj: Value = this.cache[value.toString()];
    if (!obj) {
      return null;
    }

    const t = obj.type;
    if (t === set.type.value) {
      obj = obj.valueOf();
    }

    const dirs: string[] = [];

    if (info.directives) {
      // $FlowFixMe
      const byType = directives[t] || [];
      for (const key of Object.keys(info.directives)) {
        if (byType.indexOf(key) !== -1) dirs.push(key);
      }

      // apply directives
      // TODO decompose
      for (const name of dirs) {
        switch (name) {
          case 'slice':
            // $FlowFixMe
            const args = [info.directives[name].begin || 0];
            if (info.directives[name].end || 0) {
              args.push(info.directives[name].end);
            }
            // $FlowFixMe
            obj = obj.slice(...args);
            break;
          case 'length':
            // $FlowFixMe
            obj = obj.length;
            break;
        }
      }
    }

    switch (t) {
      // fill out the array with objects
      case set.type.value:
        if (!Array.isArray(obj)) {
          break;
        } else if (info.isLeaf) {
          return value.toString();
        }
        // $FlowFixMe
        obj = obj.map(i => {
          if (i instanceof UUID) {
            context[i.toString()] = true;
            // $FlowFixMe
            return this.cache[i.toString()] || null;
          }
          return i;
        });
        break;
      case lww.type.value:
        if (info.isLeaf) {
          return value.toString();
        }
        break;
    }

    return obj;
  }

  static hash(request: Request, cbk?: Response => void): string {
    return hash({request, cbk});
  }
}
