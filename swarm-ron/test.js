"use strict";
const Op = require('./index');
const Frame = Op.Frame;
const Iterator = Frame.Iterator;
const UUID = require('swarm-ron-uuid');
const assert = require('assert');
const eq = assert.equal;
const ok = assert.ok;
const de = assert.deepEqual;

const a = Op.fromString("#id=1");
eq(a.object.value, 'id');
eq(a.object.origin, '0');
eq(a.object.sep, '$');
eq(a.value(0), 1);
eq(a.type+'', '0');
eq(a.key(), '*0#id');

const frame = "*lww#test@time-orig!:int=1:str'2'";
const ops = [
    "*lww#test@time-orig!",
    "*lww#test@time-orig:int=1",
    "*lww#test@time-orig:str'2'",
];
const vals = [
    undefined,
    1,
    "2"
];
const f = new Op.Frame(frame);
const nf = new Op.Frame();
for(let op of f) {
    eq(op.toString(), ops.shift());
    eq(op.value(0), vals.shift());
    nf.push(op);
}
eq(nf.toString(), frame);

const subs = {"$A":"1","$B":"2"};
const mapd = Op.Frame.map_uuids("@$A>0:$B>~", uuid => {
    return uuid in subs ? UUID.fromString(subs[uuid]) : uuid;
});
eq(mapd, "@1>0:2>~");

const big = "*lww#test@time-orig!:int=1@(1:str'2'@(3:ref>3";
const from = new Iterator(big);
from.nextOp();
const till = from.clone();
till.nextOp();
till.nextOp();
const crop = Frame.slice(from, till);
eq(crop, "*lww#test@time-orig:int=1@(1:str'2'");

const redef = "*lww#(1-test@`!:\\=1";
const ri = new Iterator(redef);
// TODO ok(ri.op.event.eq(ri.op.object));
ri.nextOp();
// FIXME ok(ri.op.location.eq(ri.op.object));

const template = "*lww#$1@`!";
const ti = new Iterator(template);
// FIXME ok(ti.op.event.eq(ti.op.object));

var tstart = new Date().getTime()
var repeat = 1000000/4
var rf = ''
for(var i=0; i<repeat; i++)
    rf += big
const rit = new Iterator(rf)
var lr = 1
while (rit.nextOp()!=null)
    lr++
var tend = new Date().getTime()
var tlong = tend-tstart
console.log(lr, '==', repeat*4, 'in', tlong, 'ms', tlong*1e6/(repeat*4), 'ns/op');

var arrit = new Iterator("*lww#array@2!@1:%=0@2:%1'1':1%0=1:%1=2");
var ao = 0;
eq(arrit.op.isHeader(), true)
while (arrit.nextOp()) {
    eq(arrit.op.isHeader(), false)
    ao++;
}
eq(ao, 4);

de(Op.ron2js("'1'"), ['1']);
de(Op.ron2js("=1'x\\\"y\\\"z'^3.1>ref>true>false>0"),
    [ 1, 'x"y"z', 3.1, UUID.fromString('ref'), true, false, null ],
);
de(Op.js2ron([ 1, 'x"y"z', 3.1, UUID.fromString('ref'), true, false, null ]),
  "=1'x\\\"y\\\"z'^3.1>ref>true>false>0"
);
