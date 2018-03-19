// @flow
import gql from 'graphql-tag';
import { Frame, UUID } from '../../ron/src';
import { Connection } from '../../__tests__/fixtures';
import SwarmDB from '../src';
import type { Response } from '../src';
import { InMemory } from '../../client/src/storage';

test('directive @ensure', async () => {
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
  setTimeout(() => {
    swarm.set(id, { value: 1 });
  }, 500);

  const q = gql`
    query Test($id: UUID!) {
      result @node(id: $id) {
        id
        version
        collection @slice(begin: 0) @ensure {
          id
          __typename
          version
          value
        }
      }
    }
  `;

  let c = 0;
  const res = await new Promise(async resolve => {
    const r = await swarm.execute({ gql: q, args: { id: objID } }, v => {
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
      collection: [
        {
          id: '1ABC4+user',
          __typename: 'lww',
          version: '1ABC6+user',
          value: 1,
        },
      ],
    },
  });

  expect(c).toBe(1);
});

test('directive @ensure #2', async () => {
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
        collection @ensure {
          id
          __typename
          version
          length
        }
        notExists @node(id: "nope") @ensure {
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
    const r = await swarm.execute({ gql: q, args: { id: objID } }, v => {
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
        __typename: 'set',
        version: '1ABC5+user',
        length: 1,
      },
      notExists: { id: 'nope' },
    },
  });

  expect(c).toBe(1);
});
