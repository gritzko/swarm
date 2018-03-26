// @flow
import { InMemory } from '../src/storage';

describe('InMemory', () => {
  const store = new InMemory();

  test('initial state', () => {
    expect(store.storage).toEqual({});
  });

  test('set', async () => {
    await store.set('foo', 'bar');
  });

  test('get', async () => {
    const foo = await store.get('foo');
    expect(foo).toBe('bar');
  });

  test('keys', async () => {
    const keys = await store.keys();
    expect(keys).toEqual(['foo']);
  });

  test('remove', async () => {
    await store.remove('foo');
    const foo2 = await store.get('foo');
    expect(foo2).toBe(null);
  });

  test('merge', async () => {
    const merge = (n: number): any => (prev: string | null): string | null => {
      return (prev || '') + n;
    };

    const result = await Promise.all([
      store.merge('~', merge(0)),
      store.merge('~', merge(1)),
      store.merge('~', merge(2)),
      store.merge('~', merge(3)),
      store.merge('~', merge(4)),
      store.merge('~', merge(5)),
    ]);

    expect(result).toEqual(['0', '01', '012', '0123', '01234', '012345']);
  });
});
