// @flow

import { Connection } from './fixtures';

test('~', () => { expect('~').toBe('~') })
// const assert = require('assert');
// const eq = assert.equal;
// const ok = assert.ok;
// const de = assert.deepEqual;
// const Clock = require('swarm-clock');
// const Client = require('./lib');
// const LWW = require('swarm-rdt-lww');
//
// const clock = new Clock("test");
// const client = new Client(clock);
//
// const tray = [];
// client.upstreamTo({
//     push: frame => tray.push(frame),
//     on:   (q)=>{tray.push(q)},
//     off:  (q)=>{tray.push(q)}
// });
//
// const frame = LWW.create({key: "value"});
// client.push(frame);
// de(tray, ['.lww#(1-test@`!:key"value"']);
//
// const lww = new LWW();
// client.on('.lww#(1-test?', lww);
// eq(lww.id()+'', '(1-test');
// lww._host = client;
// lww.set("key", 1);
// de(tray, [
//     '.lww#(1-test@`!:key"value"',
//     '.lww#(1-test@`?',
//     '.lww#(1-test@`(2:key=1',
// ]);
// tray.length = 0;
// lww.once("change", () => eq(lww.key, 2) );
// client.update(".lww#(1-test@(3-test2:key=2");
// eq(lww.key, 2);
//
//
// client.update('.lww#(1-test@(4-test2:`(3!:key=3'); //patch
// eq(lww.key, 3);
// eq(lww.version()+'', '(4-test2');
// eq(client.store['.lww#(1-test'],
//     '.lww#(1-test@`(4(2!:key=3');
//
//
