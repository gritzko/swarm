// @flow

import gql from 'graphql-tag';
import { Frame, UUID } from '../../ron/src';
import { Connection } from '../../__tests__/fixtures';
import SwarmDB from '../src';
import type { Response } from '../src';
import { InMemory } from '../../client/src/storage';

test('swarm.execute({ subscription })', async () => {
  const storage = new InMemory();
  let swarm = new SwarmDB({
    storage,
    upstream: new Connection('014-gql-subs.ron'),
    db: {
      id: 'user',
      name: 'test',
      auth: 'JwT.t0k.en',
      clockMode: 'Logical',
    },
  });

  await swarm.ensure();

  const objID = swarm.uuid();
  const listID = swarm.uuid();

  await swarm.set(objID, {
    a: 42,
    b: 'wat',
    c: 0.1,
    d: false,
    e: true,
    f: listID,
  });

  const list = [
    swarm.uuid(),
    swarm.uuid(),
    swarm.uuid(),
    swarm.uuid(),
    swarm.uuid(),
    swarm.uuid(),
    swarm.uuid().local(),
    swarm.uuid(),
    swarm.uuid(),
    swarm.uuid(),
  ];

  let c = 1;
  for (const item of list) {
    await swarm.add(listID, item);
    await swarm.set(item, { value: c++ });
  }

  expect(storage.storage).toEqual({
    '1ABC1+user': "*lww#1ABC1+user@1ABC3+user!:a=42:b'wat':c^0.1:d>false:e>true:f>1ABC2+user",
    '1ABC2+user':
      '*set#1ABC2+user@1ABCW+user!>1ABCD+user@(U+>1ABCC+user@(S+>1ABCB+user@(O+>1ABC9+user@(M+>1ABC8+user@(K+>1ABC7+user@(I+>1ABC6+user@(G+>1ABC5+user@(E+>1ABC4+user',
    '1ABC4+user': '*lww#1ABC4+user@1ABCF+user!:value=1',
    '1ABC5+user': '*lww#1ABC5+user@1ABCH+user!:value=2',
    '1ABC6+user': '*lww#1ABC6+user@1ABCJ+user!:value=3',
    '1ABC7+user': '*lww#1ABC7+user@1ABCL+user!:value=4',
    '1ABC8+user': '*lww#1ABC8+user@1ABCN+user!:value=5',
    '1ABC9+user': '*lww#1ABC9+user@1ABCP+user!:value=6',
    '1ABCA+~local': '*lww#1ABCA+~local@1ABCR+user!:value=7',
    '1ABCB+user': '*lww#1ABCB+user@1ABCT+user!:value=8',
    '1ABCC+user': '*lww#1ABCC+user@1ABCV+user!:value=9',
    '1ABCD+user': '*lww#1ABCD+user@1ABCX+user!:value=10',
    __meta__:
      '{"name":"test","clockLen":5,"forkMode":"// FIXME","peerIdBits":30,"horizont":604800,"offset":0,"id":"user","auth":"JwT.t0k.en","clockMode":"Logical"}',
    __pending__:
      '["*lww#1ABC1+user@1ABC3+user!:a=42:b\'wat\':c^0.1:d>false:e>true:f>1ABC2+user","*set#1ABC2+user@1ABCE+user!>1ABC4+user","*lww#1ABC4+user@1ABCF+user!:value=1","*set#1ABC2+user@1ABCG+user!>1ABC5+user","*lww#1ABC5+user@1ABCH+user!:value=2","*set#1ABC2+user@1ABCI+user!>1ABC6+user","*lww#1ABC6+user@1ABCJ+user!:value=3","*set#1ABC2+user@1ABCK+user!>1ABC7+user","*lww#1ABC7+user@1ABCL+user!:value=4","*set#1ABC2+user@1ABCM+user!>1ABC8+user","*lww#1ABC8+user@1ABCN+user!:value=5","*set#1ABC2+user@1ABCO+user!>1ABC9+user","*lww#1ABC9+user@1ABCP+user!:value=6","*set#1ABC2+user@1ABCS+user!>1ABCB+user","*lww#1ABCB+user@1ABCT+user!:value=8","*set#1ABC2+user@1ABCU+user!>1ABCC+user","*lww#1ABCC+user@1ABCV+user!:value=9","*set#1ABC2+user@1ABCW+user!>1ABCD+user","*lww#1ABCD+user@1ABCX+user!:value=10"]',
  });

  const q = gql`
    subscription Test($id: UUID!, $nope: UUID!) {
      result @node(id: $id) {
        id
        type
        a
        b
        c
        d
        e
        f {
          id
          type
          length
          list: id @node @slice(begin: 2, end: 7) {
            id
            type
            value
          }
        }
        internal @node(id: $id) {
          a
          c
          e
          flat @node(id: $id)
          notExists @node(id: $nope) @weak {
            id
            test
          }
        }
      }
    }
  `;

  let res = {};
  let calls = 0;
  // $FlowFixMe
  const r = await swarm.execute(
    { query: q, variables: { id: objID, nope: UUID.fromString('nope') } },
    (v: Response<any>) => {
      res = v;
      calls++;
    },
  );

  expect(r.ok).toBeTruthy();

  // waiting for all subscriptions  will be initialized
  await new Promise(r => setTimeout(r, 100));

  // console.log(swarm.client.lstn['nope']);
  // expect(swarm.client.lstn['nope']).toHaveLength(1);

  expect(res.error).toBeUndefined();
  expect(res.data).toEqual({
    result: {
      type: 'lww',
      a: 42,
      b: 'wat',
      c: 0.1,
      d: false,
      e: true,
      f: {
        id: '1ABC2+user',
        type: 'set',
        length: 9,
        list: [
          { type: 'lww', id: '1ABCB+user', value: 8 },
          { type: 'lww', id: '1ABC9+user', value: 6 },
          { type: 'lww', id: '1ABC8+user', value: 5 },
          { type: 'lww', id: '1ABC7+user', value: 4 },
          { type: 'lww', id: '1ABC6+user', value: 3 },
        ],
      },
      id: '1ABC1+user',
      internal: {
        a: 42,
        c: 0.1,
        e: true,
        flat: UUID.fromString('1ABC1+user'),
        notExists: null,
      },
    },
  });

  expect(calls).toBe(1);

  let item = swarm.uuid();
  await swarm.add(listID, item);
  await swarm.set(item, { value: c++ });

  await new Promise(r => setTimeout(r, 200));

  expect(calls).toBe(2);

  expect(res.error).toBeUndefined();
  expect(res.data).toEqual({
    result: {
      type: 'lww',
      a: 42,
      b: 'wat',
      c: 0.1,
      d: false,
      e: true,
      f: {
        id: '1ABC2+user',
        type: 'set',
        length: 10,
        list: [
          { type: 'lww', id: '1ABCC+user', value: 9 },
          { type: 'lww', id: '1ABCB+user', value: 8 },
          { type: 'lww', id: '1ABC9+user', value: 6 },
          { type: 'lww', id: '1ABC8+user', value: 5 },
          { type: 'lww', id: '1ABC7+user', value: 4 },
        ],
      },
      id: '1ABC1+user',
      internal: {
        a: 42,
        c: 0.1,
        e: true,
        flat: UUID.fromString('1ABC1+user'),
        notExists: null,
      },
    },
  });

  let ok2 = await swarm.set('nope', { test: 1 });
  expect(ok2).toBeTruthy();

  await new Promise(r => setTimeout(r, 200));

  expect(calls).toBe(3);

  // $FlowFixMe
  expect(swarm.client.storage.storage['nope']).toBe('*lww#nope@1ABCa+user!:test=1');

  expect(swarm.cache['nope']).toEqual({ test: 1 });

  expect(res.error).toBeUndefined();
  expect(res.data).toEqual({
    result: {
      type: 'lww',
      a: 42,
      b: 'wat',
      c: 0.1,
      d: false,
      e: true,
      f: {
        id: '1ABC2+user',
        type: 'set',
        length: 10,
        list: [
          { type: 'lww', id: '1ABCC+user', value: 9 },
          { type: 'lww', id: '1ABCB+user', value: 8 },
          { type: 'lww', id: '1ABC9+user', value: 6 },
          { type: 'lww', id: '1ABC8+user', value: 5 },
          { type: 'lww', id: '1ABC7+user', value: 4 },
        ],
      },
      id: '1ABC1+user',
      internal: {
        a: 42,
        c: 0.1,
        e: true,
        flat: UUID.fromString('1ABC1+user'),
        notExists: { id: 'nope', test: 1 },
      },
    },
  });

  expect(swarm.subs).toHaveLength(1);
  expect(r.off).toBeDefined();
  expect(r.off && r.off()).toBeTruthy();
  expect(swarm.subs).toHaveLength(0);

  ok2 = await swarm.set('nope', { test: 2 });
  expect(ok2).toBeTruthy();
  expect(res.error).toBeUndefined();
  expect(res.data).toEqual({
    result: {
      type: 'lww',
      a: 42,
      b: 'wat',
      c: 0.1,
      d: false,
      e: true,
      f: {
        id: '1ABC2+user',
        type: 'set',
        length: 10,
        list: [
          { type: 'lww', id: '1ABCC+user', value: 9 },
          { type: 'lww', id: '1ABCB+user', value: 8 },
          { type: 'lww', id: '1ABC9+user', value: 6 },
          { type: 'lww', id: '1ABC8+user', value: 5 },
          { type: 'lww', id: '1ABC7+user', value: 4 },
        ],
      },
      id: '1ABC1+user',
      internal: {
        a: 42,
        c: 0.1,
        e: true,
        flat: UUID.fromString('1ABC1+user'),
        notExists: { id: 'nope', test: 1 },
      },
    },
  });

  await new Promise(r => setTimeout(r, 1000));

  // $FlowFixMe
  let dump = swarm.client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
});

test('swarm.execute({ query })', async () => {
  const storage = new InMemory();
  const upstream = new Connection('016-gql-query.ron');
  let swarm = new SwarmDB({
    storage,
    upstream,
    db: {
      id: 'user',
      name: 'test',
      auth: 'JwT.t0k.en',
      clockMode: 'Logical',
    },
  });

  swarm = ((swarm: any): SwarmDB);

  await swarm.ensure();

  const objID = swarm.uuid();
  const listID = swarm.uuid();

  await swarm.set(objID, {
    a: 42,
    b: 'wat',
    c: 0.1,
    d: false,
    e: true,
    f: listID,
  });

  const id = swarm.uuid();

  await swarm.add(listID, id);
  await swarm.set(id, { value: 1 });

  const q = gql`
    query Test($id: UUID!, $nope: UUID!) {
      result @node(id: $id) {
        id
        type
        a
        b
        c
        d
        e
        f @slice(begin: 2, end: 7) {
          id
          type
          value
        }
        internal @node(id: $id) {
          a
          c
          e
          flat @node(id: $id)
          notExists @node(id: $nope) @weak {
            id
            test
          }
        }
      }
    }
  `;

  expect(swarm.cache).toEqual({});

  const res = await new Promise(async resolve => {
    const r = await swarm.execute(
      { query: q, variables: { id: objID, nope: UUID.fromString('nope') } },
      resolve,
    );
    expect(r.ok).toBeTruthy();
  });
  expect(swarm.subs).toHaveLength(0);

  expect(res.error).toBeUndefined();
  expect(res.data).toEqual({
    result: {
      type: 'lww',
      a: 42,
      b: 'wat',
      c: 0.1,
      d: false,
      e: true,
      f: [],
      id: '1ABC1+user',
      internal: {
        a: 42,
        c: 0.1,
        e: true,
        flat: UUID.fromString('1ABC1+user'),
        notExists: null,
      },
    },
  });
});

test('swarm.execute({ mutation })', async () => {
  const upstream = new Connection('015-gql-mutation.ron');
  const storage = new InMemory();
  let swarm = new SwarmDB({
    storage,
    upstream,
    db: { id: 'user', name: 'test', auth: 'JwT.t0k.en', clockMode: 'Logical' },
  });

  swarm = ((swarm: any): SwarmDB);

  await swarm.ensure();

  const objID = swarm.uuid();

  const q = gql`
    mutation Test($id: UUID!, $payload: Payload!, $payload2: Payload!) {
      set(id: $id, payload: $payload)
      another: set(id: $id, payload: $payload2)
    }
  `;

  let sub;
  const resp = await new Promise(async r => {
    const payload = { test: 1 };
    const payload2 = { hello: 'world' };
    sub = await swarm.execute({ query: q, variables: { id: objID, payload, payload2 } }, r);
  });

  expect(resp).toEqual({
    data: {
      set: true,
      another: true,
    },
  });

  await new Promise(r => setTimeout(r, 300));
  const dump = upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
});

test('swarm.execute({ empty })', async () => {
  const storage = new InMemory();
  let swarm = new SwarmDB({
    storage,
    upstream: new Connection('021-gql-empty-ack.ron'),
    db: { id: 'user', name: 'test', auth: 'JwT.t0k.en', clockMode: 'Logical' },
  });

  await swarm.ensure();

  const q = gql`
    subscription {
      result @node(id: "ack") @weak {
        id
        type
        version
      }
    }
  `;

  const cumul = [];
  let calls = 0;

  // $FlowFixMe
  await new Promise(r => {
    swarm.execute({ query: q }, (v: Response<any>) => {
      calls++;
      cumul.push(v.data);
      if (calls === 2) r();
    });
  });

  expect(calls).toBe(2);
  expect(cumul).toEqual([{ result: null }, { result: { id: 'ack', type: '', version: '0' } }]);
});
