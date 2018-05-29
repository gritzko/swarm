// @flow

import * as React from 'react';
import renderer from 'react-test-renderer';
import gql from 'graphql-tag';

import DB from '@swarm/db';
import { Provider, GraphQL } from '../src';
import type { Response } from '../src';
import { Connection } from '../../__tests__/fixtures';
import { InMemory } from '../../client/src/storage';

const Basic = ({ data, error, onClick }) => (
  <div>
    {JSON.stringify(data || error)}
    <button onClick={onClick}>update</button>
  </div>
);

const sub = gql`
  subscription test {
    object @node(id: "object") {
      id
      version
      test
      some
      additional
    }
  }
`;

const mutateObj = gql`
  mutation obj($payload: Payload!) {
    set(id: "object", payload: $payload)
  }
`;

test('React: graphql', async () => {
  const upstream = new Connection('018-react-graphql.ron');
  const storage = new InMemory();
  const api = new DB({
    storage,
    upstream,
    db: {
      id: 'user',
      name: 'test',
      auth: 'JwT.t0k.en',
      clockMode: 'Logical',
    },
  });

  const component = renderer.create(
    <Provider swarm={api}>
      <GraphQL query={sub} mutations={{ obj: mutateObj }}>
        {props => {
          return (
            <Basic
              {...props}
              onClick={(payload: Response<null>) => {
                // $FlowFixMe
                const p = payload || { test: props.data.object.test + 1 };
                if (props.mutations) {
                  // $FlowFixMe
                  props.mutations.obj({ payload: p });
                }
              }}
            />
          );
        }}
      </GraphQL>
    </Provider>,
  );

  await new Promise(r => setTimeout(r, 500));
  let tree = component.toJSON();
  expect(tree).toMatchSnapshot();

  component.root.findByType('button').props.onClick({ some: 'value' });

  await new Promise(r => setTimeout(r, 100));

  tree = component.toJSON();
  expect(tree).toMatchSnapshot();

  component.root.findByType('button').props.onClick();

  await new Promise(r => setTimeout(r, 100));

  tree = component.toJSON();
  expect(tree).toMatchSnapshot();

  component.root.findByType('button').props.onClick({ additional: true });

  await new Promise(r => setTimeout(r, 100));

  tree = component.toJSON();
  expect(tree).toMatchSnapshot();

  const dump = upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
});
