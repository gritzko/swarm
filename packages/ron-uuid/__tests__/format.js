// @flow

import UUID from '../src';

test('UUID compression', () => {
  const cases = [
    ['}DcR-L8w', '}IYI-', '}IYI-0'],
    ['0', '1', '1'],
    ['0', '123-0', '123-'],
    ['0', '0000000001-orig', ')1-orig'],
    ['1time01-src', '1time02+src', '{2+'],
    ['hash%here', 'hash%there', '%there'],
    ['0', 'name$0', 'name'],
    ['time-orig', 'time1+orig2', '(1+(2'],
    ['0$author', 'name$author2', 'name${2'],
    ['1', ')1', '0000000001-'],
    ['time+orig', 'time1+orig2', '(1+(2'],
    ['}DcR-}L8w', '}IYI-', '}IYI-0'],
    ['A$B', 'A-B', '-'],
    ['[1s9L3-[Wj8oO', '[1s9L3-(2Biejq', '-(2Biejq'],
  ];

  for (const c of cases) {
    const ctx = UUID.fromString(c[0]);
    expect(ctx).toBeDefined();
    expect(ctx).not.toBe(null);
    const uuid = UUID.fromString(c[1]);
    expect(uuid).toBeDefined();
    expect(uuid).not.toBe(null);
    expect(uuid.toString(ctx)).toBe(c[2]);
  }
});

test('UUID parse compressed', () => {
  const cases = [
    ['0', '1', '1'], // 0
    ['1-x', ')1', '1000000001-x'],
    ['test-1', '-', 'test-1'],
    ['hello-111', '[world', 'helloworld-111'],
    ['helloworld-111', '[', 'hello-111'],
    ['100001-orig', '[', '1-orig'], // 5
    ['1+orig', '(2-', '10002-orig'],
    ['time+orig', '(1(2', 'time1+orig2'],
    // TODO ['name$user', '$scoped', 'scoped$user'],
    ['any-thing', 'hash%here', 'hash%here'],
    ['0123456789-abcdefghij', ')~)~', '012345678~-abcdefghi~'],
    ['0123G-abcdb', '(4566(efF', '01234566-abcdefF'],
    ['[1s9L3-[Wj8oO', '-(2Biejq', '[1s9L3-(2Biejq'], // 9
    ['(2-[1jHH~', '-[00yAl', '(2-}yAl'],
  ];

  for (const c of cases) {
    const ctx = UUID.fromString(c[0]);
    expect(ctx).toBeDefined();
    expect(ctx).not.toBe(null);
    const uuid = UUID.fromString(c[1], ctx);
    expect(uuid).toBeDefined();
    expect(uuid).not.toBe(null);
    expect(uuid.toString()).toBe(c[2]);
  }
});
