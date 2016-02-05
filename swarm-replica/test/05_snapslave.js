"use strict";
var Swarm = require('..');
var SnapshotSlave = require('../src/SnapshotSlave');
var tape = require('tap').test;

tape ('replica.05.A object log meta', function(t){
    var snap = new SnapshotSlave();
    snap.on('op', function(op){
        t.equal(op.spec.toString(), '/Model#id!stamp.on');
        t.equal(op.patch.length, 1);
        t.equal(op.patch[0].value, '{"2":{"b":2,"c":3},"3":{"a":1,"d":4}}');
        t.end();
    });
    snap.writeOp(Swarm.Op.create(['/Model#id!stamp.on', '', [
        ['!1.~state', '{"a":0}'],
        ['!2.set', '{"b":2,"c":3}'],
        ['!3.set', '{"a":1,"d":4}']
    ]]));
});
