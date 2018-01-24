// @flow
import UUID, {ZERO, ERROR, Vector, Iter} from '../src';
import {equal as eq, ok} from 'assert';

const simple = UUID.fromString('time-orig');
eq(simple.value, 'time');
eq(simple.origin, 'orig');
eq(simple.sep, '-');
const simple1 = UUID.fromString('time1-orig');
ok(simple1.ge(simple));
ok(!simple1.eq(simple));
eq(simple1.toString(), 'time1-orig');
eq(simple1.toString(simple), '(1');
eq(UUID.fromString('newtime-orig').toString(simple), 'newtime-');
ok(simple.isTime());
ok(simple.isEvent());

const lww = UUID.fromString('lww');
eq(lww.sep, '$');
eq(lww.value, 'lww');
eq(lww.origin, '0');
ok(!lww.eq(UUID.fromString('lww-0')));
eq(lww.toString(), 'lww');
ok(lww.isName());
ok(!lww.isTime());

const hash = UUID.fromString('1234567890%abcdefghij');
ok(hash.isHash());

const zero = UUID.fromString('0');
eq(zero.value, '0');
eq(zero.origin, '0');
eq(zero.sep, '-');
eq(zero.toString(ERROR), '0');
eq(zero.toString(zero), '0');

const varname = UUID.fromString('$varname');
eq(varname.toString(), '$varname');
eq(varname.origin, 'varname');
ok(varname.isZero());
eq(varname.toString(simple), '0$varname');

const nice_str = UUID.fromString('1', simple);
eq(nice_str.value, '1');
eq(nice_str.origin, '0');
eq(nice_str.sep, '$');
eq(nice_str.toString(), '1');
eq(nice_str.toString(simple), '1');

eq(ZERO.toString(), '0');
eq(ZERO.origin, '0');

// no prefix compression for meaningful string constants
const str1 = UUID.fromString('long1$');
const str2 = UUID.fromString('long2$');
eq(str1.toString(str2), 'long1');

const lww1 = UUID.fromString('lww', simple1);
eq(lww1.value, 'lww');
eq(lww1.sep, '$');
eq(lww1.origin, '0');
const lww2 = UUID.fromString('lww', str1);
eq(lww2.value, 'lww');
eq(lww2.sep, '$');
eq(lww2.origin, '0');

const clone = UUID.fromString('', UUID.fromString('$A'));
eq(clone.toString() + '', '$A');

const vec = new Vector();
const uuids = ['time-origin', 'time01-origin', 'time2-origin2'].map(v => UUID.fromString(v));
vec.push(uuids[0]);
vec.push(uuids[1]);
vec.push(uuids[2]);
eq(vec.toString(), 'time-origin,[1,(2-{2');
for (let u of vec) ok(u.eq(uuids.shift()));
eq(uuids.length, 0);

const zeros = new Iter(',,,');
ok(zeros.uuid && zeros.uuid.isZero());
zeros.nextUUID();
ok(zeros.uuid && zeros.uuid.isZero());
zeros.nextUUID();
ok(zeros.uuid && zeros.uuid.isZero());
zeros.nextUUID();
ok(zeros.uuid === null);

var num = UUID.base2int('0000000011');
eq(num, 65);

test('~', () => {
  expect('~').toBe('~');
});
