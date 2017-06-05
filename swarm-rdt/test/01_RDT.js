"use strict";
const tap = require('tape').test;
const RDT = require('../src/RDT');


tap ('rdt.01.A rdt lifecycle', function (t) {

    const rdt = new RDT(null);

    t.equal(rdt.version(), '0', 'version comes from an op');
    t.equal(rdt.id(), '0', 'id comes from an op');

    const init = "#time-author@`!";
    
    rdt.update(init, '');
    t.ok(rdt.hasState());
    t.ok(rdt.hasIdentity());

    t.equal(rdt.id(), 'time-author', 'id comes from an op');

    const update = "#time-author@time01-author>0";
    const updated = RDT.reduce(init, update);
    
    t.equal(updated.toString(), "#time-author`[1!:>0");

    rdt.update(updated, update);

    t.equal(rdt.version(), 'time01-author', 'version id OK');
    t.equal(rdt.id(), 'time-author', 'id OK');
    t.equal(rdt.Id().origin, 'author');
    t.ok(rdt.hasState());
    t.ok(rdt.hasIdentity());

    // TODO close

    t.end();
});
