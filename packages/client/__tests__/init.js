// @flow

import { Frame, UUID } from '../../ron/src';
import { Connection } from '../../__tests__/fixtures';
import Client from '../src';
import { InMemory } from '../src/storage';

test('Client: new', async () => {
  const client = new Client({
    storage: new InMemory(),
    upstream: new Connection('002-hs.ron'),
    db: {
      id: 'user',
      name: 'test',
      auth: 'JwT.t0k.en',
      clockMode: 'Logical',
    },
  });

  await client.ensure();
  // $FlowFixMe
  let dump = client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  // $FlowFixMe
  expect(JSON.parse(client.storage.storage.__meta__)).toEqual({
    name: 'test',
    clockLen: 5,
    forkMode: '// FIXME',
    peerIdBits: 30,
    horizont: 604800,
    auth: 'JwT.t0k.en',
    clockMode: 'Logical',
    id: 'user',
    offset: 0,
  });
  // $FlowFixMe
  expect(client.clock.last().toString()).toBe('1ABC+server');
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
  const client = new Client({ id: 'user', storage: new InMemory() });
  try {
    await client.ensure();
  } catch (e) {
    expect(e).toEqual(
      new Error('neither connection options nor clock options found'),
    );
  }
});

test('Client: not supported clock', async () => {
  const client = new Client({
    storage: new InMemory(),
    db: {
      id: 'user',
      name: 'test',
      // $FlowFixMe
      clockMode: 'Epoch',
    },
  });

  try {
    await client.ensure();
    expect('~').toBe("this section mustn't be executed");
  } catch (e) {
    expect(e).toEqual(
      new Error("TODO: Clock mode 'Epoch' is not supported yet"),
    );
  }
});

test('Client: assigned id', async () => {
  const conn = new Connection('003-calendar-clock.ron');
  const client = new Client({
    storage: new InMemory(),
    upstream: conn,
    db: {
      name: 'test',
    },
  });

  await client.ensure();
  // $FlowFixMe
  expect(client.clock.origin()).toBe('user');
});
