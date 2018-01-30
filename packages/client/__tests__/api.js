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
    __pending__: '[]',
    __meta__:
      '{"name":"test","clockLen":5,"forkMode":"// FIXME","peerIdBits":30,"horizont":604800,' +
      '"clockMode":"Logical","credentials":{}}',
  });

  function cbk(a: string, b: string) {}
  function cbk2(a: string, b: string) {}
  function cbk3(a: string, b: string) {}

  await client.on('#testlength', cbk);
  await client.on('#testlength', cbk2);
  await client.on('#testlength', cbk2);
  await client.on('#testlength', cbk3);
  await client.on('#testlength', cbk3);
  await client.on('#testlength', cbk);

  expect(client.lstn['testlength']).toHaveLength(3);
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
  expect(client.lstn['object']).toEqual([cbk]);
  client.off('#object');
  expect(client.lstn['object']).toBeUndefined();

  function cbk2(a: string, b: string) {}

  await client.on('#test1', cbk2);
  await client.on('#test2', cbk2);
  await client.on('#test3', cbk2);
  await client.on('#batman', cbk2);

  expect(client.lstn['test1']).toHaveLength(1);
  expect(client.lstn['test2']).toHaveLength(1);
  expect(client.lstn['test3']).toHaveLength(1);
  expect(client.lstn['batman']).toHaveLength(1);

  client.off('#test1#test2#test3', cbk2);

  expect(client.lstn['test1']).toHaveLength(0);
  expect(client.lstn['test2']).toHaveLength(0);
  expect(client.lstn['test3']).toHaveLength(0);
  expect(client.lstn['batman']).toHaveLength(1);
  client.off('#batman');
  expect(client.lstn['batman']).toBeUndefined();
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
    __pending__: '["*lww#object@1ABC1+user!:bar\'biz\'","*lww#object@1ABC2+user!:foo>object"]',
    __meta__:
      '{"name":"test","clockLen":5,"forkMode":"// FIXME","peerIdBits":30,"horizont":604800,' +
      '"clockMode":"Logical","credentials":{}}',
  });
});
