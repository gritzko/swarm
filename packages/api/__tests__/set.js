// @flow

import {Frame, UUID} from '../../ron/src';
import {Connection} from '../../__tests__/fixtures';
import API from '../src';
import {InMemory} from '../../client/src/storage';

test('Set sadd', async () => {
  const storage = new InMemory();
  const api = new API({
    id: 'user',
    storage,
    upstream: new Connection('008-setadd.ron'),
    db: {
      name: 'test',
      credentials: {password: '12345'},
    },
  });

  await api.client.ensure();

  let obj = {};
  function cbk(v) {
    obj = v;
  }

  await api.on('object', cbk);
  await api.sadd('object', 5);

  expect(obj).toEqual({
    '0': 5,
  });

  await api.sadd('object', 5);
  expect(obj).toEqual({
    '0': 5,
  });
  expect(Array.prototype.slice.call(obj)).toEqual([5]);

  await api.sadd('object', 42);
  expect(obj).toEqual({
    '0': 42,
    '1': 5,
  });

  expect(obj.id).toBe('object');
  expect(Array.prototype.slice.call(obj)).toEqual([42, 5]);

  await new Promise(r => setTimeout(r, 500));
  // $FlowFixMe
  expect(api.client.storage.storage.__pending__).toBe('[]');
  expect(api.uuid().toString()).toBe('1ABC7+user');

  const sub = api.uuid();
  await api.sadd('object', sub);
  expect(obj).toEqual({
    '0': sub,
    '1': 42,
    '2': 5,
  });

  await new Promise(r => setTimeout(r, 300));
  // $FlowFixMe
  expect(api.client.storage.storage.__pending__).toBe('[]');

  await api.sadd(sub.toString(), 37);
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
  // $FlowFixMe
  expect(api.client.storage.storage.object).toBe('*set#object@1ABC9+user!>1ABC8+user@(3+=42@(2+=5@(1+=5');
});

test('Set srm', () => {
  expect('~').toBe('~');
});
