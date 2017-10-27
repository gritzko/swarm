"use strict";
require('./index');
const RON = require('swarm-ron');
const assert = require('assert');
const eq = assert.equal;
const ok = assert.ok;
const de = assert.deepEqual;
// state+op
eq(RON.reduce(
    ".lww#id@time-origin!", 
    ".lww#id@t-o:key=1"), 
    ".lww#id@t-o!:key=1"
);
// state+state
eq(RON.reduce(
    ".lww#id@time-origin!:a=1", 
    ".lww#id@time1-origin!:b=2"),
    ".lww#id@time1-origin!@(:a=1@(1:b=2"
);
// array, op+op
eq(RON.reduce(
    ".lww#id@time1-a:1=2",
    ".lww#id@time2-b:0=1"),
    ".lww#id@time2-b:`(1-a!@/:1=2@(2-b:0=1"
);
