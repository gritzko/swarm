// @flow

import { Batch, UUID } from '@swarm/ron';

import { reduce } from '../src';
import { ron2js } from '../src/lww';

import { deepEqual as de } from 'assert';

test('lww reduce', () => {
  const cases = [
    [
      // 0+o
      '*lww#test!',
      "*lww#test@time:a'A'",
      "*lww#test@time!:a'A'",
    ],
    [
      // s+o
      "*lww#test@1!:a'A'",
      "*lww#test@2:b'B'",
      "*lww#test@2!@1:a'A'@2:b'B'",
    ],
    [
      // o+o
      "*lww#test@1:a'A1'",
      "*lww#test@2:a'A2'",
      "*lww#test@2!:a'A2'",
    ],
    [
      // p+p
      "*lww#test@1:d! :a'A1':b'B1':c'C1'",
      "*lww#test@2:d! :a'A2':b'B2'",
      "*lww#test@2!:a'A2':b'B2'@1:c'C1'",
    ],
    [
      "*lww#test@0ld!@new:key'new_value'",
      "*lww#test@new:key'new_value'",
      "*lww#test@new!:key'new_value'",
    ],
    [
      '#1X8C30K+user!',
      "*lww#1X8C30K+user@1X8C30M+user!:some'value'",
      "*lww#1X8C30K+user@1X8C30M+user!:some'value'",
    ],
    [
      '*lww#1_A8H+1_A8Gu71@1_A8Ic8F01+1_A8Gu71!:completed>true',
      "*lww#1_A8H+1_A8Gu71@1_A8HE8C02+1_A8Gu71!:completed>false:title'third'",
      "*lww#1_A8H+1_A8Gu71@1_A8Ic8F01+1_A8Gu71!:completed>true@(HE8C02+:title'third'",
    ],
    [
      "*lww#1_AAuOCD01+1_AAuJN~@1_AAvY5201+1_AAvK_p!:completed>false@(uOCz01+(uJN~:title'sixth'",
      '*lww#1_AAuOCD01+1_AAuJN~@1_AAvQ2c01+1_AAvJZk!:completed>true',
      "*lww#1_AAuOCD01+1_AAuJN~@1_AAvY5201+1_AAvK_p!:completed>false@(uOCz01+(uJN~:title'sixth'",
    ],
  ];

  for (const c of cases) {
    const result = c.pop();
    expect(reduce(Batch.fromStringArray(...c)).toString()).toBe(result);
  }
});

test('lww map to js', () => {
  const array_ron = "*lww#array@2!@1:~%=0@2:%1'1':%2=1:%3=2:%4>notexists";
  let obj = ron2js(array_ron);
  expect(obj).toEqual({
    '0': 0,
    '1': '1',
    '2': 1,
    '3': 2,
    '4': UUID.fromString('notexists'),
  });
  expect(obj && obj.id).toBe('array');
  expect(obj && obj.type).toBe('lww');
  expect(obj && obj.version).toBe('2');
  expect(obj && obj.length).toBe(5);
  expect(Array.prototype.slice.call(obj)).toEqual([
    0,
    '1',
    1,
    2,
    UUID.fromString('notexists'),
  ]);

  const object_ron = "*lww#obj@2:d!:a'A2':b'B2'@1:c'C1'";
  expect(ron2js(object_ron)).toEqual({ a: 'A2', b: 'B2', c: 'C1' });

  const array_ref = '*lww#ref@t-o!:~%=1:%1=2:%2>arr';
  expect(ron2js(array_ref)).toEqual({
    '0': 1,
    '1': 2,
    '2': UUID.fromString('arr'),
  });

  const lww = '*lww#test@time-orig!:key=1:obj>time1-orig';
  expect(ron2js(lww)).toEqual({ key: 1, obj: UUID.fromString('time1-orig') });

  const array_no = '*lww#ref@t-o!:key>arr:~%=1:~%1=2';
  expect((ron2js(array_no) || { length: 42 }).length).toBeUndefined();

  const with_refs = `
  #left@2! :key'value'
  #right@3! :number=42
  *lww#root@1! :one>left :two>right
   .
  `;
  expect(ron2js(with_refs)).toEqual({
    one: UUID.fromString('left'),
    two: UUID.fromString('right'),
  });

  expect(ron2js('*lww#1ABC4+user@1ABC7+user!:active>false')).toEqual({
    active: false,
  });

  const t =
    "*lww#1ABC1+user@1ABC3+user!:a=42:b'wat':c^0.1:d>false:e>true:f>1ABC2+user";
  expect(ron2js(t)).toEqual({
    a: 42,
    b: 'wat',
    c: 0.1,
    d: false,
    e: true,
    f: UUID.fromString('1ABC2+user'),
  });
});

test('lww override', () => {
  expect(
    ron2js(
      "*lww#10001+demo@10004+demo!:completed>true@(2+:title'123':completed>false",
    ),
  ).toEqual({
    title: '123',
    completed: true,
  });
});
