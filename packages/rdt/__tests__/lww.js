// @flow

import {Batch, UUID} from 'swarm-ron';

import {reduce} from '../src';
import {ron2js} from '../src/lww';

import {deepEqual as de} from 'assert';

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
      "*lww#test@2:d!:a'A2'",
    ],
    [
      // p+p
      "*lww#test@1:d! :a'A1':b'B1':c'C1'",
      "*lww#test@2:d! :a'A2':b'B2'",
      "*lww#test@2:d!:a'A2':b'B2'@1:c'C1'",
    ],
    ["*lww#test@0ld!@new:key'new_value'", "*lww#test@new:key'new_value'", "*lww#test@new!:key'new_value'"],
    // [
    //   // lww array 2x2
    //   //     0   1
    //   //   +--------+
    //   // 0 | 0  '1' |
    //   // 1 | 1   2  |
    //   //   +--------+
    //   '*lww#array@1! :0%0 = 0,  :)1%0 = -1',
    //   "*lww#array@2! :0%)1 '1',  :)1%0 = 1,  :)1%)1 = 2",
    //   "*lww#array@2!@1:%=0@2:%)1'1':)1)=1:%)1=2",
    // ],
  ];

  for (const c of cases) {
    const result = c.pop();
    expect(reduce(Batch.fromStringArray(...c)).toString()).toBe(result);
  }
});

test('lww map to js', () => {
  const array_ron = "*lww#array@2!@1:~%=0@2:%1'1':%2=1:%3=2:%4>notexists";
  expect(ron2js(array_ron)).toEqual({
    _id: 'array',
    '0': 0,
    '1': '1',
    '2': 1,
    '3': 2,
    '4': UUID.fromString('notexists'),
    length: 5,
  });

  const object_ron = "*lww#obj@2:d!:a'A2':b'B2'@1:c'C1'";
  expect(ron2js(object_ron)).toEqual({a: 'A2', b: 'B2', c: 'C1', _id: 'obj'});

  const array_ref = '*lww#ref@t-o!:~%=1:%1=2:%2>arr';
  expect(ron2js(array_ref)).toEqual({length: 3, '0': 1, '1': 2, '2': UUID.fromString('arr'), _id: 'ref'});

  const lww = '*lww#test@time-orig!:key=1:obj>time1-orig';
  expect(ron2js(lww)).toEqual({key: 1, obj: UUID.fromString('time1-orig'), _id: 'test'});

  const array_no = '*lww#ref@t-o!:key>arr:~%=1:~%1=2';
  expect(ron2js(array_no)).toEqual({'0': 1, '1': 2, key: UUID.fromString('arr'), _id: 'ref'});

  const with_refs = `
  *lww#root@1! :one>left :two>right
  #left@2! :key'value'
  #right@3! :number=42
   .
  `;
  expect(ron2js(with_refs)).toEqual({one: UUID.fromString('left'), two: UUID.fromString('right'), _id: 'root'});

  expect(ron2js('*lww#1ABC4+user@1ABC7+user!:active>false')).toEqual({
    _id: '1ABC4+user',
    length: undefined,
    active: false,
  });
});
