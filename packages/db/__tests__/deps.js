// @flow

import { Dependencies } from '../src/deps';

describe('Dependencies', () => {
  const deps = new Dependencies();

  test('put', () => {
    deps.put(0, '1ABC3+');
    deps.put(1, '1ABC4+'); // check override
    deps.put(2, '1ABC4+');
    deps.put(3, '1ABC5+');

    expect(deps.index).toEqual({
      '1ABC3+': 0,
      '1ABC4+': 2,
      '1ABC5+': 3,
    });

    expect(deps.deps[0]).toEqual({
      '1ABC3+': true,
    });
    expect(deps.deps[2]).toEqual({
      '1ABC4+': true,
    });
    expect(deps.deps[3]).toEqual({
      '1ABC5+': true,
    });
  });

  test('toString', () => {
    expect(deps.toString(0)).toBe('#1ABC3+');
    expect(deps.toString(2)).toBe('#1ABC4+');
    expect(deps.toString(3)).toBe('#1ABC5+');
    expect(deps.toString()).toBe('#1ABC3+#(4+#(5+');
  });

  test('options', () => {
    expect(deps.options(0)).toEqual({
      ensure: true,
    });
    expect(deps.options(1)).toBeUndefined();
    expect(deps.options(2)).toEqual({
      once: true,
      ensure: true,
    });
    expect(deps.options(3)).toEqual({
      once: true,
    });
  });

  test('diff', () => {
    const from = new Dependencies();
    from.put(0, '1ABC5+');
    from.put(1, '1ABC3+');
    from.put(1, '1ABC4+');
    from.put(3, '1ABC5+');

    const diff = deps.diff(from);

    expect(diff.index).toEqual({
      '1ABC3+': 0,
      '1ABC4+': 2,
    });
  });
});
