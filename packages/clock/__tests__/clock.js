// @flow
'use strict';

import { Logical, Calendar, calendarBase2Date } from '../src';
import UUID from '../../ron-uuid/src';

describe('Logical', () => {
  const clock = new Logical('test');
  test('basic', () => {
    expect(clock.time().toString()).toBe('(1+test');
    expect(clock.time().toString()).toBe('(2+test');
    expect(clock.time().toString()).toBe('(3+test');
    clock.see(UUID.fromString('(6+test'));
    expect(clock.time().toString()).toBe('(7+test');

    const clock10 = new Logical('orig', { length: 10, last: '(5+other' });
    expect(clock10.time().toString()).toBe('(500001+orig');
  });
});

describe('Calendar', () => {
  test('basic', () => {
    const clock = new Calendar('orig');
    clock.time();
    expect(clock.time().toString() < clock.time().toString()).toBeTruthy();
  });

  test('adjust', () => {
    const clock = new Calendar('orig', { length: 7, offset: 0 });
    const now = clock.time();

    clock._offset = 864e5; // one day
    const nextDay = clock.time();

    expect(clock.last().value).toBe(nextDay.value);
    clock.adjust(now);

    expect(-100 < clock._offset && clock._offset < 0).toBeTruthy();
  });
});
