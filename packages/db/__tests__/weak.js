// @flow
import gql from 'graphql-tag';
import { Frame, UUID } from '../../ron/src';
import { Connection } from '../../__tests__/fixtures';
import SwarmDB from '../src';
import type { Response } from '../src';
import { InMemory } from '../../client/src/storage';

test('directive @weak', async () => {
  const storage = new InMemory();
  const upstream = new Connection('017-ensure-directive.ron');
  let swarm = new SwarmDB({
    storage,
    upstream,
    db: { id: 'user', name: 'test', auth: 'JwT.t0k.en', clockMode: 'Logical' },
  });

  await swarm.ensure();

  const objID = swarm.uuid();
  const listID = swarm.uuid();

  await swarm.set(objID, {
    collection: listID,
  });

  const id = swarm.uuid();

  await swarm.add(listID, id);
  await swarm.set(id, { value: 1 });

  const q = gql`
    query Test($id: UUID!) {
      result @node(id: $id) {
        id
        version
        collection {
          id
          type
          version
          length
        }
        notExists @node(id: "nope") @weak {
          id
        }
      }
    }
  `;

  let c = 0;
  setTimeout(() => {
    swarm.set('nope', { hello: 'world' });
  }, 1000);
  const res = await new Promise(async resolve => {
    const r = await swarm.execute({ query: q, variables: { id: objID } }, v => {
      c++;
      resolve(v);
    });
    expect(r.ok).toBeTruthy();
  });

  expect(res.error).toBeUndefined();
  expect(res.data).toEqual({
    result: {
      id: '1ABC1+user',
      version: '1ABC3+user',
      collection: {
        id: '1ABC2+user',
        type: 'set',
        version: '1ABC5+user',
        length: 1,
      },
      notExists: null,
    },
  });

  expect(c).toBe(1);
});
