// @flow

import { Frame, UUID } from '../../ron/src';
import { Connection } from '../../__tests__/fixtures';
import API from '../src';
import { InMemory } from '../../client/src/storage';

test('api.set(...)', async () => {
  const storage = new InMemory();
  const api = new API({
    storage,
    upstream: new Connection('006-lwwset.ron'),
    db: {
      id: 'user',
      name: 'test',
      auth: 'JwT.t0k.en',
      clockMode: 'Logical',
    },
  });

  await api.ensure();
  let obj = {};
  function cbk(v) {
    obj = v;
  }
  await api.on('object', cbk);

  let set = await api.set('object', { username: 'olebedev' });
  expect(storage.storage['object']).toBe(
    "*lww#object@1ABC1+user!:username'olebedev'",
  );
  set = await api.set('object', { email: 'ole6edev@gmail.com' });
  expect(storage.storage['object']).toBe(
    "*lww#object@1ABC2+user!:email'ole6edev@gmail.com'@(1+:username'olebedev'",
  );
  set = await api.set('object', { email: undefined });
  expect(storage.storage['object']).toBe(
    "*lww#object@1ABC3+user!:email,@(1+:username'olebedev'",
  );

  expect(Object.keys(api.client.lstn)).toEqual(['object']);
  expect(api.client.lstn['object']).toHaveLength(1);

  const profileUUID = api.uuid();
  set = await api.set('object', { profile: profileUUID });

  expect(storage.storage['object']).toBe(
    "*lww#object@1ABC5+user!@(3+:email,@(5+:profile>1ABC4+user@(1+:username'olebedev'",
  );

  expect(api.client.lstn['object']).toEqual(api.client.lstn['1ABC4+user']);

  expect(obj).toEqual({
    username: 'olebedev',
    profile: profileUUID,
  });

  expect(obj.id).toBe('object');
  expect(obj.type).toBe('lww');

  expect(api.cache['object']).toEqual({
    profile: UUID.fromString('1ABC4+user'),
    username: 'olebedev',
  });

  expect(api.cache['1ABC4+user']).toBe(null);

  await new Promise(r => setTimeout(r, 300));

  set = await api.set(profileUUID.toString(), { active: true });
  expect(storage.storage[profileUUID.toString()]).toBe(
    '*lww#1ABC4+user@1ABC6+user!:active>true',
  );
  expect(api.cache['object']).toEqual({
    profile: UUID.fromString('1ABC4+user'),
    username: 'olebedev',
  });

  expect(api.cache['1ABC4+user']).toEqual({
    active: true,
  });
  // $FlowFixMe
  expect(api.cache['1ABC4+user'].id).toBe('1ABC4+user');

  expect(obj).toEqual({
    username: 'olebedev',
    profile: {
      active: true,
    },
  });

  expect(api.client.lstn['object']).toEqual(api.client.lstn['1ABC4+user']);

  set = await api.set(profileUUID.toString(), { active: false });
  expect(storage.storage[profileUUID.toString()]).toBe(
    '*lww#1ABC4+user@1ABC7+user!:active>false',
  );

  expect(obj).toEqual({
    username: 'olebedev',
    profile: {
      active: false,
    },
  });

  // due to async nature of connection mock
  await new Promise(r => setTimeout(r, 1000));

  // $FlowFixMe
  const dump = api.client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  // $FlowFixMe
  expect(api.client.storage.storage['1ABC4+user']).toBe(
    '*lww#1ABC4+user@1ABC7+user!:active>false',
  );
  // $FlowFixMe
  expect(JSON.parse(api.client.storage.storage.__meta__)).toEqual({
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
  expect(JSON.parse(api.client.storage.storage.__pending__)).toEqual([]);
  expect(storage.storage.object).toBe(
    "*lww#object@1ABD+olebedev!@1ABC3+user:email,@1ABD+olebedev:profile,@1ABC1+user:username'olebedev'",
  );
  expect(api.uuid().toString()).toBe('1ABD1+user');

  expect(obj).toEqual({
    username: 'olebedev',
  });

  set = await api.set('object', { local: UUID.fromString('test').local() });
  expect(storage.storage.object).toBe(
    "*lww#object@1ABD+olebedev!@1ABC3+user:email,@1ABD+olebedev:profile,@1ABC1+user:username'olebedev'",
  );
  expect(set).toBeFalsy();
});
