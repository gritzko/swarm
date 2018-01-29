// @flow

import {Batch, Cursor} from 'swarm-ron';

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
  de(ron2js(array_ron), Object.assign(JSON.parse('[0,"1",1,2,{"$ref":"notexists"}]'), {_id: 'array'}));

  const array_ron_2 = "*lww#array@2!@1:~%=0@2:%4>notexists:%1'1':%2=1:%3=2";
  de(ron2js(array_ron_2), Object.assign(JSON.parse('[0,"1",1,2,{"$ref":"notexists"}]'), {_id: 'array'}));

  const object_ron = "*lww#obj@2:d!:a'A2':b'B2'@1:c'C1'";
  de(ron2js(object_ron), JSON.parse('{"a":"A2","b":"B2","c":"C1","_id":"obj"}'));

  const array_ref = '*lww#ref@t-o!:~%=1:%1=2:%2>arr';
  de(ron2js(array_ref), Object.assign(JSON.parse('[1,2,{"$ref":"arr"}]'), {_id: 'ref'}));

  const lww = '*lww#test@time-orig!:key=1:obj>time1-orig';
  de(ron2js(lww), JSON.parse('{"key":1,"obj":{"$ref":"time1-orig"},"_id":"test"}'));

  const array_no = '*lww#ref@t-o!:key>arr:~%=1:~%1=2';
  de(ron2js(array_no), JSON.parse('{"0":1,"1":2,"key":{"$ref":"arr"},"_id":"ref"}'));

  const with_refs = `
*lww#root@1! :one>left :two>right 
#left@2! :key'value'
#right@3! :number=42
 .
`;
  de(
    ron2js(with_refs),
    JSON.parse('{"one":{"key":"value","_id":"left"},"two":{"number":42,"_id":"right"},"_id":"root"}'),
  );
});
