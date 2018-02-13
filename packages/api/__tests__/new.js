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
      auth: 'JwT.t0k.en',
    },
  });

  await api.ensure();
  // $FlowFixMe
  let dump = api.client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  // $FlowFixMe
  expect(JSON.parse(api.client.storage.storage.__meta__)).toEqual({
    name: 'test',
    clockLen: 5,
    forkMode: '// FIXME',
    peerIdBits: 30,
    horizont: 604800,
    auth: 'JwT.t0k.en',
    clockMode: 'Logical',
  });
  expect(api.uuid().toString()).toBe('1ABC1+user');
});
