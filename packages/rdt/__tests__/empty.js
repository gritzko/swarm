// @flow

import { ron2js } from '../src';

test('rdt zero2js', () => {
  let set = ron2js('*set#test1!');
  // $FlowFixMe
  expect(set.type).toBe('set');
  // $FlowFixMe
  expect(set.id).toBe('test1');
  // $FlowFixMe
  expect(set.version).toBe('0');
  expect(set).toEqual({});

  set = ron2js('#test1');
  // $FlowFixMe
  expect(set.type).toBe('');
  // $FlowFixMe
  expect(set.id).toBe('test1');
  // $FlowFixMe
  expect(set.version).toBe('0');
  expect(set).toEqual({});
});
