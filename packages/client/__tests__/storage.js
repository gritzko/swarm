import { InMemory } from '../src/storage';

test('InMemory', async () => {
  const store = new InMemory();
  expect(store.storage).toEqual({});
  await store.set('foo', 'bar');
  const foo = await store.get('foo')
  expect(foo).toBe('bar');
  const keys = await store.keys()
  expect(keys).toEqual(['foo'])
  await store.remove('foo')
  const foo2 = await store.get('foo')
  expect(foo2).toBe(undefined);
})
