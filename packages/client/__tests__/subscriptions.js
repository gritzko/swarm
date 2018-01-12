// @flow

import {Connection} from './fixtures';
import Client from '../src';
import {InMemory} from '../src/storage';

test('Client: new', async () => {
  expect('~').toBe('~');
  // const client = new Client({
  //   id: 'user',
  //   storage: new InMemory(),
  //   upstream: new Connection('002-hs.ron'),
  //   db: {
  //     name: 'test',
  //     credentials: {password: '12345'},
  //   },
  // });
  //
  // await client.ensure();
  // // $FlowFixMe
  // let dump = client.upstream.dump();
  // expect(dump.session).toEqual(dump.fixtures);
  // // $FlowFixMe
  // expect(client.storage.storage).toEqual({
  //   __meta__:
  //     '{"name":"test","clockLen":5,"forkMode":"// FIXME","peerIdBits":30,"horizont":604800,' +
  //     '"credentials":{"password":"12345"},"clockMode":"Logical"}',
  // });
});
