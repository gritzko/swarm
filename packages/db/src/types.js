// @flow
import type { DocumentNode } from 'graphql';
import type { Atom } from '@swarm/ron';
import { UUID } from '@swarm/ron';

export type Variables = { [string]: Atom | { [string]: Atom } };

export type Response<T> = {
  data: T,
  off?: () => boolean,
  error?: Error,
};

export type Request = {
  query: DocumentNode,
  variables?: Variables,
};

export interface IClient {
  on(
    id: string,
    cbk: (string, string | null) => void,
    options?: { once?: true, ensure?: true },
  ): Promise<boolean>;
  off(id: string, cbk: (string, string | null) => void): string | void;
}

export interface IApi {
  set(id: string | UUID, payload: { [string]: Atom | void }): Promise<boolean>;
  add(id: string | UUID, value: Atom): Promise<boolean>;
  remove(id: string | UUID, value: Atom): Promise<boolean>;
}
