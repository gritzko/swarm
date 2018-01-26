// @flow

import {Batch, Cursor} from 'swarm-ron';

import {reduce} from '../src';

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
