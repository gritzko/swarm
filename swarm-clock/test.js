"use strict";
const Clock = require('./lib/index').default;
const UUID = require('swarm-ron-uuid');
const assert = require('assert');
const eq = assert.equal;
const ok = assert.ok;
const de = assert.deepEqual;

const clock = new Clock("test");
eq(clock.time()+'', "(1-test");
eq(clock.time()+'', "(2-test");
eq(clock.time()+'', "(3-test");
clock.see(UUID.fromString("(6-test"));
eq(clock.time()+'', "(7-test");

const clock10 = new Clock("orig", {length: 10, last: "(5-other"});
eq(clock10.time()+'', "(500001-orig");

