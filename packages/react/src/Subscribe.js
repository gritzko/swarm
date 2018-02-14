// @flow

import * as React from 'react';
import PropTypes from 'prop-types';
import invariant from 'invariant';

import API from 'swarm-api';
import type {Value} from 'swarm-api';

type Props = {
  to: Array<string>,
  swarm?: API,
  children?: ({
    unsubscribe: () => void,
    initialized: boolean,
    swarm: ?API,
    data: {[string]: Value},
  }) => React.Node,
};

type State = {
  initialized: boolean,
  data: {[string]: Value},
};

export default class Subscribe extends React.Component<Props, State> {
  swarm: ?API;
  cbks: {[string]: (Value) => void};

  constructor(props: Props, context: {swarm: ?API}) {
    super(props, context);
    this.swarm = context.swarm || this.props.swarm;
    invariant(
      this.swarm,
      `Could not find "swarm" in either the context or ` +
        `props of <Subscribe>. ` +
        `Either wrap the root component in a <Provider>, ` +
        `or explicitly pass "swarm" as a prop to <Subscribe>.`,
    );
    this.cbks = {};
    this.state = {
      initialized: !!this.swarm && !!this.swarm.client.clock,
      data: {},
    };

    if (!this.state.initialized && !!this.swarm) {
      this.swarm
        .ensure()
        .then(() => {
          this._subscribe();
          this.setState({initialized: true});
        })
        .catch(e => console.error(e));
    } else {
      this._subscribe();
    }

    // $FlowFixMe
    this._unsubscribe = this._unsubscribe.bind(this);
  }

  _subscribe(): void {
    if (!this.swarm) return;
    for (const k of this.props.to) {
      this.cbks[k] = (v: Value) => {
        const state = {
          ...this.state,
          data: {
            ...this.state.data,
            [k]: v || null,
          },
        };
        this.setState(state);
      };

      this.swarm && this.swarm.on(k, this.cbks[k]).catch(e => console.error(e));
    }
  }

  componentDidUpdate(prev: Props) {
    if (!shallowEqual(this.props.to, prev.to)) {
      this._unsubscribe();
      this._subscribe();
    }
  }

  componentWillUnmount() {
    this._unsubscribe();
  }

  _unsubscribe(): void {
    for (const k of Object.keys(this.cbks)) {
      if (this.swarm) this.swarm.off(k, this.cbks[k]);
    }
    this.cbks = {};
  }

  _filterData(): {[string]: Value} {
    const ret = {};
    for (const k of this.props.to) {
      ret[k] = this.state.data[k] || null;
    }
    return ret;
  }

  render() {
    return (
      this.props.children &&
      this.props.children.call(null, {
        unsubscribe: this._unsubscribe,
        initialized: this.state.initialized,
        swarm: this.swarm,
        data: this._filterData(),
      })
    );
  }
}

Subscribe.contextTypes = {
  swarm: PropTypes.shape({}).isRequired,
};

function shallowEqual(a: string[], b: string[]): boolean {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (const item of a) {
    if (b.indexOf(item) === -1) return false;
  }
  return true;
}
