"use strict";
const map = require('./index');
const assert = require('assert');
const eq = assert.equal;
const ok = assert.ok;
const de = assert.deepEqual;

// TODO the wrapper fn
const array_ron = ".lww#arr@t-o!:)0=1:)1=2:)2=3";
eq(map(array_ron).toString(),
    ".json#arr@t-o!:body'[1,2,3]'");

const array_ref = ".lww#ref@t-o!:)0=1:)1=2:)2>arr";
eq(map(array_ref).toString(),
    '.json#ref@t-o!:body\'[1,2,{"$ref":1}]\':refs>>arr');

const array_no = ".lww#ref@t-o!:)0=1:)1=2:key>arr";
eq(map(array_no).toString(),
    '.json#ref@t-o!:body\'{"0":1,"0000000001":2,"key":{"$ref":1}}\':refs>>arr');

// FIXME the >>>> notation?
const lww = ".lww#test@time-orig!:key=1:obj>time1-orig";
const lww2json =
    '.json#test@time-orig!'+
    ':body\'{"key":1,"obj":{"$ref":1}}\''+
    ':refs>>time1-orig';
eq(map(lww).toString(), lww2json);
