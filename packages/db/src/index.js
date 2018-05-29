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

import type { Request, Response } from './types';
import { GQLSub } from './subscription';

export { default as UUID } from '@swarm/ron-uuid';
export { Verbose } from '@swarm/client/lib/connection';
export { LocalStorage, InMemory } from '@swarm/client';

export type { Request, Response, Variables } from './types';
export type { Atom } from '@swarm/ron';

export default class SwarmDB extends API {
  constructor(options: Options): SwarmDB {
    super(options);
    return this;
  }

  async execute<T>(
    request: Request,
    callback?: (Response<T>) => void,
  ): Promise<{ ok: boolean, off?: () => boolean }> {
    const h = GQLSub.hash(request, callback);
    for (const s of this.subs) {
      if (s.is(h)) {
        return { ok: false };
      }
    }

    if (request.query.definitions.length !== 1) {
      throw new Error(`unexpected length of definitions: ${request.query.definitions.length}`);
    }

    await this.ensure();
    const sub = new GQLSub(this, this.client, this.cache, request, callback);
    this.subs.push(sub);
    sub.finalize((h: string) => {
      let c = -1;
      for (const s of this.subs) {
        c++;
        if (s.is(h)) {
          this.subs.splice(c, 1);
          break;
        } else {
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
