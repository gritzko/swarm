// @flow
'use strict';

import {Cursor} from 'swarm-ron';

import {reduce} from '../src';
import {equal as eq} from 'assert';

// state+op
eq(reduce('*lww#id@time-origin!', '*lww#id@t-o:key=1'), '*lww#id@t-o!:key=1');

// state+state
eq(
  reduce('*lww#id@time-origin!:a=1', '*lww#id@time1-origin!:b=2'),
  '*lww#id@time1-origin!@(:a=1@(1:b=2',
);

// array, op+op
eq(
  reduce('*lww#id@time1-a:1=2', '*lww#id@time2-b:0=1'),
  '*lww#id@time2-b:time1-a!:0=1@(1-a:1=2',
);

// array, op+op, sorting
eq(
  reduce('*lww#id@time1-a:)1=2', '*lww#id@time2-b:0=1'),
  '*lww#id@time2-b:time1-a!:0=1@(1-a:)1=2',
);

eq(
  reduce('*lww#test!', "*lww#test@time-orig:key'value'"),
  "*lww#test@time-orig!:key'value'",
);

// eclipsed value
eq(
  reduce(
    "*lww#test@time-orig!:key'value'",
    "*lww#test@0time-orig:key'eclipsed'",
  ),
  "*lww#test@0time-orig!@time-:key'value'",
);

test('~', () => {
  expect('~').toBe('~');
});
