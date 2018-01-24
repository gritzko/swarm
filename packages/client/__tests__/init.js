// @flow

import {Frame, UUID} from '../../ron/src';
import {Connection} from './fixtures';
import Client from '../src';
import {InMemory} from '../src/storage';

test('Client: new', async () => {
  const client = new Client({
    id: 'user',
    storage: new InMemory(),
    upstream: new Connection('002-hs.ron'),
    db: {
      name: 'test',
      credentials: {password: '12345'},
    },
  });

  await client.ensure();
  // $FlowFixMe
  let dump = client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  // $FlowFixMe
  expect(client.storage.storage).toEqual({
    __meta__:
      '{"name":"test","clockLen":5,"forkMode":"// FIXME","peerIdBits":30,"horizont":604800,' +
      '"credentials":{"password":"12345"},"clockMode":"Logical"}',
  });
  expect(client.clock && client.clock.last().eq(UUID.fromString('1ABC+server'))).toBeTruthy();
  expect(client.clock && client.clock.time().toString()).toBe('1ABC1+user');
});

test('Client: reconnect - init before connnection', async () => {
  const storage = new InMemory();
  const meta =
    '{"name":"test","clockLen":5,"forkMode":"// FIXME","peerIdBits":30,"horizont":604800,' +
    '"credentials":{"password":"12345"},"clockMode":"Logical"}';
  await storage.set('__meta__', meta);

  const client = new Client({
    id: 'user',
    storage,
    upstream: new Connection('002-hs.ron'),
  });

  await client.ensure();
});

test('Client: w/o clock/url/connection', async () => {
  const client = new Client({id: 'user', storage: new InMemory()});
  try {
    await client.ensure();
  } catch (e) {
    expect(e).toEqual(new Error('neither connection options nor clock options found'));
  }
});

test('Client: not supported clock', async () => {
  const client = new Client({
    id: 'user',
    storage: new InMemory(),
    db: {name: 'test', clockMode: 'Epoch'},
  });

  try {
    await client.ensure();
  } catch (e) {
    expect(e).toEqual(new Error("TODO: Clock mode 'Epoch' is not supported yet"));
  }
});

test('Client: not supported clock from peer', async () => {
  const conn = new Connection('003-calendar-clock.ron');
  const client = new Client({
    id: 'user',
    storage: new InMemory(),
    upstream: conn,
    db: {name: 'test'},
  });

  try {
    await client.ensure();
  } catch (e) {
    expect(e).toEqual(new Error("TODO: Clock mode 'Calendar' is not supported yet"));
  }
});
