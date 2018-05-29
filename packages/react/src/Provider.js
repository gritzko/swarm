// @flow

import * as React from 'react';
import PropTypes from 'prop-types';
import API from '@swarm/db';

export default class Provider extends React.Component<{
  swarm: API,
  children: React.ChildrenArray<React.Node>,
}> {
  getChildContext() {
    return { swarm: this.props.swarm };
  }

  render() {
    let { children } = this.props;
    return React.Children.only(children);
  }
}

Provider.childContextTypes = {
  swarm: PropTypes.shape({}).isRequired,
};
