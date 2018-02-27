// @flow

import {Frame, UUID} from '../../ron/src';
import {Connection} from '../../__tests__/fixtures';
import API from '../src';
import {InMemory} from '../../client/src/storage';

test('set.add(....)', async () => {
  const storage = new InMemory();
  const api = new API({
    storage,
    upstream: new Connection('008-setadd.ron'),
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
  await api.add('object', 5);

  expect(obj).toEqual({
    '0': 5,
  });

  await api.add('object', 5);
  expect(obj).toEqual({
    '0': 5,
  });
  expect(obj.valueOf()).toEqual([5]);

  await api.add('object', 42);
  expect(obj).toEqual({
    '0': 42,
    '1': 5,
  });

  expect(obj.id).toBe('object');
  expect(obj.valueOf()).toEqual([42, 5]);

  await new Promise(r => setTimeout(r, 500));
  expect(storage.storage.__pending__).toBe('[]');
  expect(api.uuid().toString()).toBe('1ABC7+user');

  const sub = api.uuid();
  await api.add('object', sub);
  expect(obj).toEqual({
    '0': sub,
    '1': 42,
    '2': 5,
  });

  await new Promise(r => setTimeout(r, 300));
  expect(storage.storage.__pending__).toBe('[]');

  await api.add(sub, 37);
  expect(obj).toEqual({
    '0': {
      '0': 37,
    },
    '1': 42,
    '2': 5,
  });

  await new Promise(r => setTimeout(r, 300));

  // $FlowFixMe
  const dump = api.client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  expect(storage.storage.object).toBe('*set#object@1ABC9+user!>1ABC8+user@(3+=42@(2+=5@(1+=5');

  const add = await api.add('object', UUID.fromString('test').local());
  expect(storage.storage.object).toBe('*set#object@1ABC9+user!>1ABC8+user@(3+=42@(2+=5@(1+=5');
  expect(add).toBeFalsy();
});

test('set.remove(...)', async () => {
  const storage = new InMemory();
  const api = new API({
    storage,
    upstream: new Connection('010-setrm.ron'),
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

  await api.add('object', 5);
  expect(obj).toEqual({
    '0': 5,
  });

  let rm = await api.remove('object', 4);
  expect(rm).toBeFalsy();
  expect(obj).toEqual({'0': 5});

  expect(storage.storage.object).toBe('*set#object@1ABC1+user!=5');

  rm = await api.remove('object', 5);
  expect(rm).toBeTruthy();
  expect(obj).toEqual({});

  await new Promise(r => setTimeout(r, 300));

  rm = await api.remove('thisone', 42);
  expect(rm).toBeTruthy();
  expect(obj).toEqual({});

  const thisone = await new Promise(async r => await api.on('thisone', r));
  expect(thisone).toEqual({});

  await new Promise(r => setTimeout(r, 300));
  // $FlowFixMe
  const dump = api.client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  expect(storage.storage.object).toBe('*set#object@1ABC3+user!:1ABC1+user,');
});
