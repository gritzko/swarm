"use strict";
const RONStream = require('./index');
const Op = require("swarm-ron");
const Stream = Op.Stream;
const Frame = Op.Frame;
const Iterator = Frame.Iterator;
const UUID = require('swarm-ron-uuid');
const assert = require('assert');
const eq = assert.equal;
const ok = assert.ok;
const de = assert.deepEqual;
const net = require('net');

RONStream.DEBUG = true;

class Echo extends Stream {
    constructor () {
        super();
        this.i = 0;
    }
    check (frame) {
        for(const i = new Iterator(frame); i.op; i.nextOp())
            eq(i.op.value(0), this.i++);
    }
    update (frame, echo) {
        this.check(frame);
    }
    push (frame, echo) {
        if (frame!==null)
            this.check(frame);
        echo.update(frame);
    }
}

const server = net.createServer((socket) => {
    const up = new RONStream(socket, new Echo(), false);
    server.close();
}).on('error', (err) => {
    throw err;
});

server.listen(() => {
    const conn = net.connect({port: server.address().port}, () => {
        const ron_stream = new RONStream(conn, new Echo(), true);
        let c = 0;
        const i = setInterval(() => ron_stream.push
            (".inc#test@test:add="+(c++)),  1);
        setTimeout(()=>{
            clearInterval(i);
            ron_stream.push(null);
        }, 1000);
    });
});

