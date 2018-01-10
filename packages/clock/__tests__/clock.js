// @flow
'use strict';

import { Logical } from '../src';
import UUID from 'swarm-ron-uuid';

import {equal as eq} from 'assert';

const clock = new Logical('test');
eq(clock.time().toString(), '(1-test');
eq(clock.time().toString(), '(2-test');
eq(clock.time().toString(), '(3-test');
clock.see(UUID.fromString('(6-test'));
eq(clock.time().toString(), '(7-test');

const clock10 = new Logical('orig', {length: 10, last: '(5-other'});
eq(clock10.time().toString(), '(500001-orig');

test('~', () => {
  expect('~').toBe('~');
});
