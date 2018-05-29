// @flow

import {Batch} from '@swarm/ron';
import {reduce} from '../src';

test('log reduce', () => {
  const cases = [['*log#id!@2+B:b=2@1+A:a=1', '*log#id@3+C:c=3@1+A:a=1', '*log#id@3+C!:c=3@2+B:b=2@1+A:a=1']];

  for (const c of cases) {
    const result = c.pop();
    expect(reduce(Batch.fromStringArray(...c)).toString()).toBe(result);
  }
});
