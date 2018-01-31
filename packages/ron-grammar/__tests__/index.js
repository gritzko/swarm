// @flow
import RON from '../src';
import {equal as eq, ok} from 'assert';

function tester(re) {
  return new RegExp('^(?:' + re.source + ')$', '');
}

const UUID = tester(RON.UUID);
ok(UUID.test('0'));
ok(UUID.test('$name'));
ok(UUID.test('time-origin'));
ok(UUID.test('-origin'));
ok(UUID.test(''));
ok(!UUID.test('--'));

const ATOM = tester(RON.ATOM);
ok(ATOM.test('=1'));
ok(!ATOM.test('=1='));
ok(!ATOM.test("'''"));
ok(ATOM.test("'\\''"));
ok(ATOM.test("'\\\\\\''"));
ok(!ATOM.test("'\\\\\\'"));
ok(ATOM.test("'\\u000a'"));

ok(ATOM.test("'\"single-quoted \\'\"'"));
ok(ATOM.test('\'{"json":"not terrible"}\''));

ok(ATOM.test('^3.1415'));
ok(ATOM.test('^.1'));
ok(ATOM.test('^1.0e6'));
ok(!ATOM.test('^1e6')); // mandatory .
ok(!ATOM.test('^1'));
ok(ATOM.test('^0.0'));

ok(ATOM.test('>true'));
ok(ATOM.test('>false'));

const FRAME = tester(RON.FRAME);
ok(FRAME.test('*lww#`@`:`>end'));
ok(FRAME.test('#$name?'));
ok(FRAME.test('*lww#time-orig@`:key=1'));
ok(FRAME.test("*lww#name@time-orig!:key=1:string'str'"));

ok(FRAME.test('*lww#test@time-orig:ref>>another.'));
ok(FRAME.test("*lww#test@time-orig!:A=1,:B'2':C>3."));

test('~', () => {
  expect('~').toBe('~');
});
