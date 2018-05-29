// @flow

import { Frame } from '@swarm/ron';
import UUID, { ZERO } from '@swarm/ron-uuid';

type Kind = 0 | 1 | 2 | 3;

export const REACTIVE: Kind = 0;
export const REACTIVE_WEAK: Kind = 1;
export const STATIC: Kind = 2;
export const STATIC_WEAK: Kind = 3;
export const KINDS = [REACTIVE, REACTIVE_WEAK, STATIC, STATIC_WEAK];

type depsMap = { [string]: true };

export class Dependencies {
  deps: Array<depsMap>;
  index: { [string]: Kind };

  constructor() {
    this.deps = [{}, {}, {}, {}];
    this.index = {};
  }

  diff(from: Dependencies): Dependencies {
    const diff = new Dependencies();
    for (const key of Object.keys(this.index)) {
      if (
        !from.index.hasOwnProperty(key) ||
        from.index[key] !== this.index[key]
      ) {
        diff.put(this.index[key], key);
      }
    }
    return diff;
  }

  toString(kind?: Kind): string {
    const ret = Object.keys(
      typeof kind !== 'undefined' ? this.deps[kind] : this.index,
    );
    if (!ret.length) return '';

    let res = '';
    ret.map(i => UUID.fromString(i)).reduce((prev, current) => {
      res += '#';
      res += current.toString(prev);
      return current;
    }, ZERO);
    return res;
  }

  options(kind: Kind): { once?: true, ensure?: true } | void {
    switch (kind) {
      case REACTIVE:
        return { ensure: true };
      case REACTIVE_WEAK:
        return;
      case STATIC:
        return { once: true, ensure: true };
      case STATIC_WEAK:
        return { once: true };
    }
  }

  put(k: Kind, id: string): void {
    this.index[id] = k;
    delete this.deps[REACTIVE][id];
    delete this.deps[REACTIVE_WEAK][id];
    delete this.deps[STATIC][id];
    delete this.deps[STATIC_WEAK][id];
    this.deps[k][id] = true;
  }

  static getKind(
    type: 'query' | 'subscription' | 'mutation',
    directives: ?{},
  ): Kind {
    directives = directives || {};
    if (
      (type === 'query' && directives.hasOwnProperty('live')) ||
      (type === 'subscription' && !directives.hasOwnProperty('static'))
    ) {
      return directives.hasOwnProperty('weak') ? REACTIVE_WEAK : REACTIVE;
    } else {
      return directives.hasOwnProperty('weak') ? STATIC_WEAK : STATIC;
    }
  }
}
