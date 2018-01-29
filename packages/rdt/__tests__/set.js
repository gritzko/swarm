// @flow

import Op, {Batch, Frame} from 'swarm-ron';
import {reduce} from '../src';

test('Set reduce', () => {
  const fixtures = [
    ['*set#test1@1!@=1', '*set#test1@2:1;', '*set#test1@2!:1,'],
    ['*set#test1@3:1;', '*set#test1@4:2;', '*set#test1@4:d!:2,@3:1,'],
    ['*set#test1@2!@=2@1=1', '*set#test1@5!@=5@3:2,@4:1,', '*set#test1@5!=5@3:2,@4:1,'],
    ['*set#test1@2!@=2@1=1', '*set#test1@3!@:2,@4:1,', '*set#test1@5!@=5', '*set#test1@5!=5@3:2,@4:1,'],
    ['*set#test1@3!@:2,@4:1,', '*set#test1@5!@=5', '*set#test1@2!@=2@1=1', '*set#test1@2!@5=5@3:2,@4:1,'],
    ['*set#test1@1=1', '*set#test1@2=2', '*set#test1@2:d!:0=2@1=1'],
  ];

  let c = 0;
  for (const fixt of fixtures) {
    const output = new Frame(fixt.pop());
    const reduced = reduce(Batch.fromStringArray(...fixt));
    expect(reduced.toString()).toBe(output.toString());
  }
});
