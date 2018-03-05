// @flow

import * as React from 'react';
import renderer from 'react-test-renderer';

import API from 'swarm-api';
import {Provider, Subscribe} from '../src';
import {Connection} from '../../__tests__/fixtures';
import {InMemory} from '../../client/src/storage';

const Basic = ({data, initialized}) => <div initialized={initialized}>{JSON.stringify(data)}</div>;

test('React, basic', async () => {
  const upstream = new Connection('011-react.ron');

  // to keep the connection closed after initialization explicitly
  await new Promise(r => setTimeout(r, 10));

  const storage = new InMemory();
  const api = new API({
    storage,
    upstream,
    db: {
      id: 'user',
      name: 'test',
      auth: 'JwT.t0k.en',
      clockMode: 'Logical',
    },
  });

  let object = {};
  api.on('object', o => {
    object = o;
  });

  // count calls, to unsubscribe after step #3
  let c = -1;

  const component = renderer.create(
    <Provider swarm={api}>
      <Subscribe to={['object']}>
        {props => {
          expect(props.swarm).toBe(api);
          c++;
          if (c === 2) props.unsubscribe();
          // try to return malformed markup, but won't happened actually
          // b/c the state won't changed and next call won't happened
          // b/c of props.unsubscribe call
          if (c > 2) return <span>¯\_(ツ)_/¯</span>;
          return <Basic {...props} />;
        }}
      </Subscribe>
    </Provider>,
  );

  let tree = component.toJSON();
  expect(tree).toMatchSnapshot();

  await new Promise(r => setTimeout(r, 10));

  // start to communicate
  upstream.onopen(new Event(''));

  tree = component.toJSON();
  expect(tree).toMatchSnapshot();

  await api.ensure();

  tree = component.toJSON();
  expect(tree).toMatchSnapshot();

  // b/c of async nature of mock connection
  await new Promise(r => setTimeout(r, 500));

  expect(object).toEqual({test: 5});

  tree = component.toJSON();
  expect(tree).toMatchSnapshot();

  await api.set('object', {some: 'value'});
  expect(object).toEqual({test: 5, some: 'value'});

  tree = component.toJSON();
  expect(tree).toMatchSnapshot();

  const dump = upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
});
