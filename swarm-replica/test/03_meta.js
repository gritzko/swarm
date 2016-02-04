"use strict";
var Swarm = require('..');
var LogMeta = require('../src/LogMeta');
var tape = require('tap').test;

tape ('replica.03.A object log meta', function(t){
    var meta = new LogMeta();
    t.equal(meta.last, '0');
    t.equal(meta.tip, '0');
    t.equal(meta.toString(), '');
    meta.vv.add('stamp+source');
    t.equal(meta.toString(), 'v:!stamp+source');
    meta.base = meta.last = meta.tip = 'base+source';
    var big_meta = 'l:base+source v:!stamp+source a:0';
    t.equal(meta.toString(), big_meta);

    var meta2 = new LogMeta(meta.toString());
    t.equal(meta2.toString(), big_meta);
    t.equal(meta2.base, 'base+source');
    t.equal(meta2.tip, 'base+source');
    t.equal(meta2.last, 'base+source');
    t.ok(meta2.vv.covers('stamp+source'));
    t.ok(!meta2.vv.covers('stamp1+source'));

    t.end();
});


tape('replica.03.B serialize/deserialize', function(t){
    var metas = [
        'l:4+N2 v:!4+N2!2+N1!1+M b:0+N t:5+M a:1+M',
        'l:1+N',
        'l:2+M v:!2+M t:3+M a:1+M'
    ];
    metas.forEach(function(meta){
        var lm = new LogMeta(meta);
        t.equal(lm.toString(), meta);
    });
    t.end();
});
