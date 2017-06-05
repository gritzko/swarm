"use strict";
const tap = require('tape').test;
const RON = require('swarm-ron');
const RDT = require('../src/RDT');
const GCounter = require('../src/GCounter');
const Host = require('../src/Host');


tap ('rdt.02.A counter - ingress', function (t) {

    const i = new GCounter(null);

    t.equal(i.version(), '0', 'version comes from an op');
    t.equal(i.id(), '0', 'id comes from an op');

    const init = ".inc#time-author@`!";

    i.update(init, '');
    t.ok(i.hasState());
    t.ok(i.hasIdentity());
    t.equal(i.id(), 'time-author', 'id comes from an op');
    t.equal(i.value(), 0);

    const update = ".inc#time-author@`[1:inc=1";
    const updated = RDT.reduce(init, update);

    t.equal(updated.toString(), ".inc#time-author`[1!:sum=1");

    i.update(updated, update);

    t.equal(i.version(), 'time01-author', 'version id OK');
    t.equal(i.id(), 'time-author', 'id OK');
    t.equal(i.Id().origin, 'author');
    t.ok(i.hasState());
    t.ok(i.hasIdentity());
    t.equals(i.value(), 1);
    t.equal(i.version(), "time01-author");

    // TODO close

    // TODO create, inc, API

    t.end();
});


tap ('rdt.02.B counter - egress', function (t) {

    const host = new Host(new RON.Clock('test02B', {ClockMode: 'Logical'}));

    const j = host.create(GCounter, 4);
    t.ok( j.hasState() );
    t.ok( j.hasIdentity() );
    j.inc(38);

    t.equal(j.value(), 42);
    // unreduced frame queue  TODO prereduced
    t.equal(host.unacked_queue().toString(), '.inc#[1-test02B`!:sum=4@[2:inc=38');

    t.end();
});