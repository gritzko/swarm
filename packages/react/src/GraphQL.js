// @flow

import regeneratorRuntime from 'regenerator-runtime'; // for async/await work flow

import * as React from 'react';
import PropTypes from 'prop-types';
import invariant from 'invariant';
import type { DocumentNode } from 'graphql';

import DB from '@swarm/db';
import type { Request, Response as DBResponse } from '@swarm/db';
import type { Value } from '@swarm/api';
import type { Variables } from '@swarm/db';
import type { Atom } from '@swarm/ron';
import UUID, { ERROR } from '@swarm/ron-uuid';

export type Mutation = Variables => Promise<Value>;

export type Response<T> = {
  data: ?T,
  uuid: ?() => UUID,
  error?: Error,
  mutations: { [string]: Mutation },
};

type Props<T> = {
  query?: DocumentNode,
  variables?: Variables,
  swarm?: DB,
  mutations?: { [string]: DocumentNode },
  children: (r: Response<T>) => React.Node,
};

type State<T> = {
  data: ?T,
  error?: Error,
  mutations: {
    [string]: Mutation,
  },
  initialized: boolean,
};

export default class GraphQL<T> extends React.Component<Props<T>, State<T>> {
  swarm: ?DB;
  _off: void | (() => boolean);
  _unmounted: boolean;

  constructor(props: Props<T>, context: { swarm: ?DB }) {
    super(props, context);
    this.swarm = context.swarm || this.props.swarm;
    invariant(
      this.swarm,
      `Could not find "swarm" in either the context or ` +
        `props of <GraphQL>. ` +
        `Either wrap the root component in a <Provider>, ` +
        `or explicitly pass "swarm" as a prop to <GraphQL>.`,
    );

    this._unmounted = false;
    this.state = {
      data: null,
      mutations: this._bindMutations(),
      initialized: this.swarm ? this.swarm.client.queue === undefined : false,
    };

    if (this.swarm) {
      this.swarm
        .ensure()
        .then(() => {
          this._subscribe();
          this.setState({ initialized: true });
        })
        .catch(error => {
          !this._unmounted && this.setState({ error });
        });
    }
  }

  componentDidUpdate(prev: Props<T>) {
    if (
      this.props.query !== prev.query ||
      !shallowEqual(this.props.variables, prev.variables) ||
      !shallowEqual(this.props.mutations, prev.mutations)
    ) {
      this._unsubscribe();
      !this._unmounted &&
        this.setState(
          {
            data: null,
            error: undefined,
            mutations: this._bindMutations(),
          },
          this._subscribe.bind(this),
        );
    }
  }

  componentWillUnmount() {
    this._unmounted = true;
    this._unsubscribe();
  }

  async _subscribe(): Promise<void> {
    const {
      props: { query, variables },
      swarm,
    } = this;
    if (!swarm || !swarm.execute || !query) return;

    const sub = await swarm.execute({ query, variables }, (r: DBResponse<any>) => {
      !this._unmounted && this.setState({ data: r.data, error: r.error });
    });

    if (this._off) this._off();
    this._off = sub.off;
  }

  _unsubscribe() {
    this._off && this._off();
  }

  _bindMutations(): {
    [string]: Mutation,
  } {
    const {
      props: { mutations },
      swarm,
    } = this;
    const ret = {};
    if (mutations && swarm) {
      for (const key of Object.keys(mutations)) {
        ret[key] = async (variables: Variables): Promise<Value> => {
          return new Promise((resolve, reject) => {
            swarm.execute({ query: mutations[key], variables }, (r: DBResponse<any>) => {
              r.error ? reject(r.error) : resolve(r.data);
            });
          });
        };
      }
    }
    return ret;
  }

  render() {
    return (
      this.props.children &&
      this.props.children.call(null, {
        data: this.state.data,
        uuid: this.state.initialized && this.swarm ? this.swarm.uuid : null,
        error: this.state.error,
        mutations: this.state.mutations,
      })
    );
  }
}

GraphQL.contextTypes = {
  swarm: PropTypes.shape({}).isRequired,
};

function shallowEqual(a?: {}, b?: {}): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  var aKeys = Object.keys(a);
  if (Object.keys(b).length !== aKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
