"use strict";
const Server = require('./index');
const Op = require('swarm-ron');
const Stream = Op.Stream;
require('swarm-rdt-lww');
const assert = require('assert');
const eq = assert.equal;
const ok = assert.ok;
const de = assert.deepEqual;

const serv = new Server({
    pubsub: new Server.DefaultPubsub(),
    store:  new Server.DefaultStore(),
    loglet: new Server.DefaultLoglets(),
});

class Tray extends Stream {
    constructor () {
        super();
        this.frames = [];
    }
    update (frame) {
        this.frames.push(frame);
    }
    skim () {
        const ret = this.frames.join(' ');
        this.frames = [];
        return ret;
    }
}
const tray1 =  new Tray();

const ups = [
    '.lww#test!',
    '.lww#test@)1-o:key=1',
    '.lww#test@)2-o:key=2'
];
serv.on('.lww#test?', tray1);
eq(tray1.skim(), ups[0]);
serv.push(ups[0]);
eq(tray1.skim(), ups[0]);
serv.push(ups[1]);
eq(tray1.skim(), ups[1]);

const tray2 = new Tray();
serv.on('.lww#test?', tray2);
eq(tray2.skim(), '.lww#test@)1-o!:key=1');

serv.push(ups[2]);
eq(tray1.skim(), ups[2]);
eq(tray2.skim(), ups[2]);

const tray3 = new Tray();
serv.on('.lww#test:)1-o?', tray2);
eq(tray2.skim(), '.lww#test@)2-o:`!:key=2');
