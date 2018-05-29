// @flow

import regeneratorRuntime from 'regenerator-runtime'; // for async/await work flow

import type { DocumentNode } from 'graphql';
import graphql from 'graphql-anywhere';
import hash from 'object-hash';

import { lww, set, ron2js } from '@swarm/rdt';
import Op, { Frame } from '@swarm/ron';
import UUID, { ZERO } from '@swarm/ron-uuid';
import API from '@swarm/api';
import type { Options, Value } from '@swarm/api';
import type { Atom } from '@swarm/ron';

import type { Request, Response, IClient, IApi } from './types';
import { node, parseDate, applyScalarDirectives } from './utils';

import { Dependencies, KINDS, REACTIVE_WEAK } from './deps';

export class GQLSub {
  cache: { [string]: { [string]: Atom } };
  client: IClient;
  api: IApi;
  finalizer: ((h: string) => void) | void;
  cbk: (<T>(Response<T>) => void) | void;
  active: boolean | void;
  request: Request;
  id: string; // hash from payload object

  deps: Dependencies;

  operation: 'query' | 'mutation' | 'subscription';
  invokeTimer: TimeoutID;

  constructor(
    api: IApi,
    client: IClient,
    cache: { [string]: { [string]: Atom } },
    request: Request,
    cbk?: (Response<any>) => void,
  ): GQLSub {
    this.api = api;
    this.request = request;
    this.id = GQLSub.hash(request, cbk);
    // $FlowFixMe
    this.operation = request.query.definitions[0].operation;

    this.client = client;
    this.cache = cache;
    this.cbk = cbk;
    this.deps = new Dependencies();

    // $FlowFixMe
    this._invoke = this._invoke.bind(this);
    return this;
  }

  is(h: string): boolean {
    return this.id === h;
  }

  off(): boolean {
    if (this.active === true) {
      let ret = false;
      switch (this.operation) {
        case 'query':
        case 'subscription':
          ret = !!this.client.off('', this._invoke);
          this.active = !ret;
          break;
        case 'mutation':
          // do nothing actually b/c we have no any real subscriptions
          this.active = ret = false;
      }
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
        this.active = true;
        this.callback();
        break;
      case 'mutation':
        this.active = true;
        const res = await this.runMutation();
        this.off();
        return res;
      default:
        throw new Error(`unknown operation: '${this.operation}'`);
    }
    return this.active || false;
  }

  _invoke(l: string, s: string | null): void {
    // prevent unauthorized calls
    if (this.active === false) {
      this.client.off('', this._invoke);
      return;
    }
    clearTimeout(this.invokeTimer);

    // passable values:
    // - null
    // - {version: '0', id: <id>, type: ''} // server told that there is no data
    // - full state
    let v = null;
    if (s !== null) v = ron2js(s || l);
    // console.log('_invoke', { v, l, s });

    let id;
    const head = Op.fromString(l);
    if (head && !head.object.eq(ZERO)) {
      id = head.object.toString();
    } else return;

    // $FlowFixMe ?
    this.cache[id] = v;
    this.invokeTimer = setTimeout(() => this.callback(), 0);
  }

  subscribe(): void {
    for (const kind of KINDS) {
      const on = this.deps.toString(kind);
      if (on) {
        const options = this.deps.options(kind);
        this.client.on(on, this._invoke, options);
      }
    }
  }

  callback(): void {
    if (this.active !== true) return;
    const { ready, tree, deps } = this.buildTree();

    const diff = this.deps.diff(deps);
    this.deps = deps;
    const off = diff.toString();
    if (off) this.client.off(off, this._invoke);
    this.subscribe();

    if (!ready) return;

    const { cbk } = this;
    if (cbk) {
      if (this.operation !== 'mutation') {
        // drop this sub from
        if (Object.keys(deps.index).length === 0) {
          this.off();
        }
        cbk({
          data: tree,
          off: () => this.off(),
        });
      } else {
        cbk({ data: tree });
      }
    }
  }

  buildTree(): {
    tree: Value,
    deps: Dependencies,
    ready: boolean,
  } {
    const ctx = {
      ready: true,
      deps: new Dependencies(),
    };

    const tree = graphql(
      this.resolver.bind(this),
      this.request.query,
      {},
      ctx,
      this.request.variables,
    );

    return {
      tree,
      ready: ctx.ready,
      deps: ctx.deps,
    };
  }

  resolver(
    fieldName: string,
    root: { [string]: Atom },
    args: { [string]: Atom },
    context: { ready: boolean, deps: Dependencies },
    info: {
      isLeaf: boolean,
      directives: { [string]: { [string]: Atom } } | void,
    },
  ): mixed {
    if (root instanceof UUID) return null;

    // workaround type
    if (fieldName === 'type') fieldName = 'type';

    let value: Atom = root[fieldName];
    if (typeof value === 'undefined') value = null;

    // get UUID from @node directive if presented
    // thus, override the value if `id` argument passed
    value = node(value, info.isLeaf, info.directives);

    // if atom value is not a UUID or is a leaf, return w/o
    // any additional business logic
    if (!(value instanceof UUID) || info.isLeaf) {
      return applyScalarDirectives(value, info.directives);
    }

    const kind = Dependencies.getKind(this.operation, info.directives);
    const ensure = (kind | 1) !== kind;
    const reactive = (kind | 2) !== kind;
    const id = value.toString();
    // $FlowFixMe
    let obj: Value = this.cache[id];

    if (reactive || typeof obj === 'undefined' || (!obj && ensure)) {
      context.deps.put(kind, id);
    }

    context.ready = context.ready && this.cache.hasOwnProperty(id);

    for (const key of Object.keys(info.directives || {})) {
      // $FlowFixMe
      const dir = info.directives[key];
      switch (key) {
        case 'slice':
          if (!obj) continue;
          if (!Array.isArray(obj)) obj = obj.valueOf();
          // $FlowFixMe
          const args = [(dir && dir.begin) || 0];
          if (dir && dir.end) args.push(dir.end);
          obj = obj.slice(...args);
          break;
        case 'reverse':
          if (!obj) continue;
          if (!Array.isArray(obj)) obj = obj.valueOf();
          obj.reverse();
          break;
      }
    }

    if (ensure) context.ready = context.ready && !!obj;

    if (!Array.isArray(obj)) return obj;

    for (let i = 0; i < obj.length; i++) {
      if (!(obj[i] instanceof UUID)) continue;
      // $FlowFixMe
      const value = this.cache[obj[i].toString()];

      if (reactive || typeof value === 'undefined' || (!value && ensure)) {
        // $FlowFixMe
        context.deps.put(kind, obj[i].toString());
      }
      // check if value presented
      if (typeof value === 'undefined') {
        context.ready = false;
        // $FlowFixMe
      } else if (ensure) context.ready = context.ready && value && value.id;
      // $FlowFixMe
      obj[i] = value || null;
    }

    return obj;
  }

  async runMutation(): Promise<boolean> {
    const ctx = {};
    const tree = graphql(
      this.mutation.bind(this),
      this.request.query,
      {},
      ctx,
      this.request.variables,
    );

    const all = [];

    for (const key of Object.keys(tree)) {
      const v = tree[key];
      all.push(
        Promise.resolve(v).then(ok => {
          tree[key] = ok;
        }),
      );
    }

    Promise.all(all)
      .then(() => {
        if (this.cbk) this.cbk({ data: tree });
      })
      .catch(error => {
        if (this.cbk) this.cbk({ data: null, error });
      });

    return true;
  }

  mutation(
    fieldName: string,
    root: { [string]: Atom },
    args: {
      id: string | UUID,
      value?: Atom,
      payload?: { [string]: Atom | void },
    },
    context: { [string]: true },
    info: { directives: { [string]: { [string]: Atom } } | void },
  ): mixed {
    if (!info.isLeaf) return false;
    switch (fieldName) {
      case 'set':
        if (!args.payload) return false;
        return this.api.set(args.id, args.payload);
      case 'add':
        return this.api.add(args.id, args.value || null);
      case 'remove':
        return this.api.remove(args.id, args.value || null);
      default:
        return false;
    }
  }

  static hash(request: Request, cbk?: (Response<*>) => void): string {
    return hash({ request, cbk });
  }
}
