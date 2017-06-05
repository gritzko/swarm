"use strict";
const tap = require('tape').test;
// const bat = require('swarm-bat');
const RON = require('swarm-ron');
const GCounter = require('../src/GCounter');
const Host = require('../src/Host');

class ZeroStream {
    constructor (pair) {
        if (pair===undefined)
            pair = new ZeroStream(this);
        this.pair = pair;
        this.lstn = null;
    }
    on(event, callback) {
        this.lstn = callback;
    }
    write (str) {
        this.pair.lstn && this.pair.lstn(str);
    }
}


tap ('rdt.02.a host 2 host', function (t) {

    const hostA = new Host(new RON.Clock('hostA', {ClockMode: 'Logical'}));
    const hostB = new Host(new RON.Clock('hostB', {ClockMode: 'Logical'}));

    const stream = new ZeroStream();

    hostA.connect(stream);
    hostB.connect(stream.pair);

    const iA = hostA.create(GCounter, 4);

    const iB = hostB.get(GCounter, iA.id());

    t.equal(iB.value(), 4);
    iB.inc(1);

    t.equal(iA.value(), 5);

    t.end();

});