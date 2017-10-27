"use strict";
const Client = require('./index');
const Clock = require('swarm-clock');
require('swarm-rdt-lww');
const assert = require('assert');
const eq = assert.equal;
const ok = assert.ok;
const de = assert.deepEqual;

const clock = new Clock("test");
const client = new Client(clock);
const tray = [];
client.setUpstream(tray);

const lww = client.create(LWW, {
    key: "value"
});
de(tray, ['.lww#)1-test@`!:key"value"']);
lww.set("key", 1);
de(tray, ['.lww#)1-test@`!:key"value"', '.lww#)1-test@`)2:key=1']);
tray.length = 0;
lww.once("change", () => eq(lww.key, 2) );
client.update(".lww#)1-test@)3-test2:key=2");
eq(lww.key, 2);
client.subscribe(LWW, '0000000001-test');
de(tray, ['.lww#)1-test@)3-test2?']);

client.update('.lww#)1-test@)4-test2:`)3!:key=3');
eq(lww.key, 3);
eq(lww.version()+'', '0000000004-test2');
// TODO miexd frame
eq(client.getState(LWW, '0000000001-test'), 
    '.lww#)1-test@)4-test2!:key=3');
