// @flow
'use strict';
import Op, {UUID, Frame, mapUUIDs, slice, ron2js, js2ron, Cursor} from '../src';
import {equal as eq, ok, deepEqual as de} from 'assert';

test('ron comments', () => {
  const frame = "*lww#test@time-orig! *~ 'comment'! *lww :int=1:str'2'";
  const ops = ['*lww#test@time-orig!', "*~'comment'!", '*lww:int=1', "*lww:str'2'"];

  const f = new Frame(frame);
  for (let op of f) {
    expect(op.toString()).toBe(ops.shift());
  }
});

test('main section', () => {
  const a = Op.fromString('#id=1');
  eq(a !== null, true);
  eq(a && a.object.value, 'id');
  eq(a && a.object.origin, '0');
  eq(a && a.object.sep, '$');
  eq(a && a.value(0), 1);
  eq(a && a.type.toString() + '', '0');
  eq(a && a.key(), '*0#id');

  const frame = "*lww#test@time-orig!:int=1:str'2'";
  const ops = ['*lww#test@time-orig!', '*lww#test@time-orig:int=1', "*lww#test@time-orig:str'2'"];
  const vals = [undefined, 1, '2'];
  const f = new Frame(frame);
  const nf = new Frame();
  for (let op of f) {
    eq(op.toString(), ops.shift());
    eq(op.value(0), vals.shift());
    nf.push(op);
  }
  eq(nf.toString(), frame);

  const subs = {$A: '1', $B: '2'};
  const mapd = mapUUIDs('@$A>0:$B>~', uuid => {
    return subs[uuid.toString()] ? UUID.fromString(subs[uuid.toString()]) : uuid;
  });
  eq(mapd, '@1>0:2>~');

  const big = "*lww#test@time-orig!:int=1@(1:str'2'@(3:ref>3";
  const from = new Cursor(big);
  from.nextOp();
  const till = from.clone();
  till.nextOp();
  till.nextOp();
  const crop = slice(from, till);
  eq(crop, "*lww#test@time-orig:int=1@(1:str'2'");

  const redef = '*lww#(1-test@`!:\\=1';
  const ri = new Cursor(redef);
  // TODO ok(ri.op.event.eq(ri.op.object));
  ri.nextOp();
  // FIXME ok(ri.op.location.eq(ri.op.object));

  const template = '*lww#$1@`!';
  const ti = new Cursor(template);
  // FIXME ok(ti.op.event.eq(ti.op.object));

  var tstart = new Date().getTime();
  var repeat = 1000000 / 4;
  var rf = '';
  for (var i = 0; i < repeat; i++) rf += big;
  const rit = new Cursor(rf);
  var lr = 1;
  while (rit.nextOp() != null) lr++;
  var tend = new Date().getTime();
  var tlong = tend - tstart;
  console.log(lr, '==', repeat * 4, 'in', tlong, 'ms', tlong * 1e6 / (repeat * 4), 'ns/op');

  var arrit = new Cursor("*lww#array@2!@1:%=0@2:%1'1':1%0=1:%1=2");
  var ao = 0;
  eq(arrit.op && arrit.op.isHeader(), true);
  while (arrit.nextOp()) {
    eq(arrit.op && arrit.op.isHeader(), false);
    ao++;
  }
  eq(ao, 4);

  de(ron2js("'1'"), ['1']);
  de(ron2js('=1\'x\\"y\\"z\'^3.1>ref>true>false>0'), [1, 'x"y"z', 3.1, UUID.fromString('ref'), true, false, null]);
  de(js2ron([1, 'x"y"z', 3.1, UUID.fromString('ref'), true, false, null]), '=1\'x\\"y\\"z\'^3.1>ref>true>false>0');

  expect('~').toBe('~');
});
