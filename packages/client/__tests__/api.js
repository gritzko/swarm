// @flow

import {Connection} from './fixtures';
import Client from '../src';
import {InMemory} from '../src/storage';

test('client.on(...)', async () => {
  const client = new Client({
    id: 'user',
    storage: new InMemory(),
    upstream: new Connection('004-query.ron'),
    db: {name: 'test'},
  });

  await client.ensure();
  const resp = await new Promise(async r => {
    client.on('#object', (frame, state) => r({frame, state}));
  });

  expect(resp).toEqual({
    state: "*lww#object@time+author!:key'value'",
    frame: "*lww#object@time+author!:key'value'",
  });

  expect(client.lstn['object']).toBeDefined();

  // $FlowFixMe
  let dump = client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);

  // $FlowFixMe
  expect(client.storage.storage).toEqual({
    object: "*lww#object@time+author!:key'value'",
    __meta__:
      '{"name":"test","clockLen":5,"forkMode":"// FIXME","peerIdBits":30,"horizont":604800,' +
      '"clockMode":"Logical","credentials":{}}',
  });
});

test('client.update(...)', async () => {
  const toCheck = [];
  // stealth-mode client
  const client = new Client({
    id: 'user',
    storage: new InMemory(),
    db: {clockMode: 'Logical', name: 'test'},
  });

  await client.ensure();

  await client.on('*lww#object', (frame: string, state: string): void => {
    toCheck.push({frame, state});
  });
  await client.update("*lww#object@time+author!:key'value'");
  await client.update("*lww#object@time2+author!:key'value2'");
  await client.update("*lww#object@time1+author!:key'value1'");

  // $FlowFixMe
  expect(client.storage.storage).toEqual({
    object: "*lww#object@time1+author!@(2+:key'value2'",
    __meta__:
      '{"name":"test","clockLen":5,"forkMode":"// FIXME","peerIdBits":30,"horizont":604800,' + '"clockMode":"Logical"}',
  });
  expect(toCheck).toEqual([
    {
      frame: "*lww#object@time+author!:key'value'",
      state: "*lww#object@time+author!:key'value'",
    },
    {
      frame: "*lww#object@time2+author!:key'value2'",
      state: "*lww#object@time2+author!:key'value2'",
    },
    {
      frame: "*lww#object@time1+author!:key'value1'",
      state: "*lww#object@time1+author!@(2+:key'value2'",
    },
  ]);
});

test('client.off(...)', async () => {
  // stealth-mode client
  const client = new Client({
    id: 'user',
    storage: new InMemory(),
    db: {clockMode: 'Logical', name: 'test'},
  });
  await client.ensure();
  const cbk = (frame: string, state: string): void => {};
  await client.on('*lww#object', cbk);
  expect(client.lstn['object']).toBe(cbk);
  client.off('#object');
  expect(client.lstn['object']).toBeUndefined();
});

test('client.push(...)', async () => {
  const client = new Client({
    id: 'user',
    storage: new InMemory(),
    upstream: new Connection('005-push.ron'),
    db: {name: 'test'},
  });

  await client.ensure();
  const resp = await new Promise(async r => {
    client.on('#object', (frame, state) => r({frame, state}));
  });

  expect(client.lstn['object']).toBeDefined();
  expect(resp).toEqual({
    state: "*lww#object@time+author!:key'value'",
    frame: "*lww#object@time+author!:key'value'",
  });

  client.off('#object');

  await client.push("#object!:bar'biz'");
  await client.push('#object!:foo>object');

  await new Promise(r => setTimeout(r, 20));
  // $FlowFixMe
  let dump = client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);

  // $FlowFixMe
  expect(client.storage.storage).toEqual({
    object: "*lww#object@1ABC2+user!@(1+:bar'biz'@(2+:foo>object@time+author:key'value'",
    __meta__:
      '{"name":"test","clockLen":5,"forkMode":"// FIXME","peerIdBits":30,"horizont":604800,' +
      '"clockMode":"Logical","credentials":{}}',
  });
});
