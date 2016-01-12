"use strict";
var Swarm = require('..');
var LogMeta = require('../src/LogMeta');
var tape = require('tap').test;

tape ('replica.03.A object log meta', function(t){
    var meta = new LogMeta();
    t.equal(meta.last, null);
    t.equal(meta.tip, null);
    t.equal(meta.toString(), 'b:0');
    meta.vv.add('stamp+source');
    t.equal(meta.toString(), 'b:0 v:!stamp+source');
    meta.base = meta.last = meta.tip = 'base+source';
    t.equal(meta.toString(), 'b:base+source v:!stamp+source');

    var meta2 = new LogMeta(meta.toString());
    t.equal(meta2.toString(), 'b:base+source v:!stamp+source');
    t.equal(meta2.base, 'base+source')
    t.equal(meta2.tip, 'base+source')
    t.ok(meta2.vv.covers('stamp+source'));
    t.ok(!meta2.vv.covers('stamp1+source'));

    t.end();
});
