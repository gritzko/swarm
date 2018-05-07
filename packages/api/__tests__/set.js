// @flow

import { Frame, UUID } from '../../ron/src';
import { Connection } from '../../__tests__/fixtures';
import API from '../src';
import { InMemory } from '../../client/src/storage';

test('set.add(...)', async () => {
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

  let obj = [];
  function cbk(id: string, state: string | null) {
    obj.push({ id, state });
  }

  await api.client.on('#object', cbk);
  await new Promise(r => setTimeout(r, 300));
  let ok = await api.add('object', 5);
  expect(ok).toBeTruthy();

  expect(obj).toEqual([
    { id: '#object', state: null },
    { id: '#object', state: '' },
    { id: '#object', state: '*set#object@1ABC1+user!=5' },
  ]);

  await api.add('object', 5);
  expect(obj).toEqual([
    { id: '#object', state: null },
    { id: '#object', state: '' },
    { id: '#object', state: '*set#object@1ABC1+user!=5' },
    { id: '#object', state: '*set#object@1ABC2+user!=5@(1+=5' },
  ]);

  ok = await api.add('object', 42);
  expect(ok).toBeTruthy();
  expect(obj).toEqual([
    { id: '#object', state: null },
    { id: '#object', state: '' },
    { id: '#object', state: '*set#object@1ABC1+user!=5' },
    { id: '#object', state: '*set#object@1ABC2+user!=5@(1+=5' },
    { id: '#object', state: '*set#object@1ABC3+user!=42@(2+=5@(1+=5' },
  ]);

  await new Promise(r => setTimeout(r, 500));
  expect(storage.storage.__pending__).toBe('[]');
  expect(api.uuid().toString()).toBe('1ABC7+user');

  const sub = api.uuid();
  await api.client.on('#' + sub.toString(), cbk);
  await api.add('object', sub);
  expect(obj).toEqual([
    { id: '#object', state: null },
    { id: '#object', state: '' },
    { id: '#object', state: '*set#object@1ABC1+user!=5' },
    { id: '#object', state: '*set#object@1ABC2+user!=5@(1+=5' },
    { id: '#object', state: '*set#object@1ABC3+user!=42@(2+=5@(1+=5' },
    { id: '#1ABC8+user', state: null },
    {
      id: '#object',
      state: '*set#object@1ABC9+user!>1ABC8+user@(3+=42@(2+=5@(1+=5',
    },
  ]);

  await new Promise(r => setTimeout(r, 300));

  await api.add(sub, 37);
  expect(obj).toEqual([
    { id: '#object', state: null },
    { id: '#object', state: '' },
    { id: '#object', state: '*set#object@1ABC1+user!=5' },
    { id: '#object', state: '*set#object@1ABC2+user!=5@(1+=5' },
    { id: '#object', state: '*set#object@1ABC3+user!=42@(2+=5@(1+=5' },
    { id: '#1ABC8+user', state: null },
    {
      id: '#object',
      state: '*set#object@1ABC9+user!>1ABC8+user@(3+=42@(2+=5@(1+=5',
    },
    { id: '#1ABC8+user', state: '' },
    { id: '#1ABC8+user', state: '*set#1ABC8+user@1ABCA+user!=37' },
  ]);

  await new Promise(r => setTimeout(r, 300));

  // $FlowFixMe
  const dump = api.client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  expect(storage.storage.object).toBe(
    '*set#object@1ABC9+user!>1ABC8+user@(3+=42@(2+=5@(1+=5',
  );

  const add = await api.add('object', UUID.fromString('test').local());
  expect(storage.storage.object).toBe(
    '*set#object@1ABC9+user!>1ABC8+user@(3+=42@(2+=5@(1+=5',
  );
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

  let obj = [];
  function cbk(id: string, state: string | null) {
    obj.push({ id, state });
  }
  await api.client.on('#object', cbk);

  await new Promise(r => setTimeout(r, 500));

  await api.add('object', 5);
  expect(obj).toEqual([
    { id: '#object', state: null },
    { id: '#object', state: '' },
    { id: '#object', state: '*set#object@1ABC1+user!=5' },
  ]);

  let rm = await api.remove('object', 4);
  expect(rm).toBeFalsy();
  expect(obj).toEqual([
    { id: '#object', state: null },
    { id: '#object', state: '' },
    { id: '#object', state: '*set#object@1ABC1+user!=5' },
  ]);

  expect(storage.storage.object).toBe('*set#object@1ABC1+user!=5');

  rm = await api.remove('object', 5);
  expect(rm).toBeTruthy();
  expect(obj).toEqual([
    { id: '#object', state: null },
    { id: '#object', state: '' },
    { id: '#object', state: '*set#object@1ABC1+user!=5' },
    { id: '#object', state: '*set#object@1ABC3+user!:1ABC1+user,' },
  ]);

  // $FlowFixMe
  expect(api.client.lstn['thisone']).toBeUndefined();
  await new Promise(resolve => {
    api.client.on('#thisone', resolve, { ensure: true, once: true });
  });

  rm = await api.remove('thisone', 42);
  expect(rm).toBeTruthy();

  const thisone = await new Promise(r => {
    api.client.on('#thisone', (id: string, state: string | null) => {
      r({ id, state });
    });
  });
  expect(thisone).toEqual({
    id: '#thisone',
    state: '*set#thisone@1ABC6+user!:1ABC5+user,',
  });

  await new Promise(r => setTimeout(r, 300));
  // $FlowFixMe
  const dump = api.client.upstream.dump();
  expect(dump.session).toEqual(dump.fixtures);
  expect(storage.storage.object).toBe('*set#object@1ABC3+user!:1ABC1+user,');
});
