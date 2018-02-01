// @flow

import {Frame, UUID} from '../../ron/src';
import {Connection} from '../../__tests__/fixtures';
import API from '../src';
import {InMemory} from '../../client/src/storage';

test('API new', async () => {
  const api = new API({
    id: 'user',
    storage: new InMemory(),
    upstream: new Connection('002-hs.ron'),
    db: {
      name: 'test',
      credentials: {password: '12345'},
    },
  });

  await api.ensure();
  // $FlowFixMe
  let dump = api.client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  // $FlowFixMe
  expect(api.client.storage.storage).toEqual({
    __meta__:
      '{"name":"test","clockLen":5,"forkMode":"// FIXME","peerIdBits":30,"horizont":604800,' +
      '"credentials":{"password":"12345"},"clockMode":"Logical"}',
  });
  expect(api.uuid().toString()).toBe('1ABC1+user');
});
