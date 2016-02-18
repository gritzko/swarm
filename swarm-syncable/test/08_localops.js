"use strict";
var Swarm = require('../');
var LocalOpSource = Swarm.LocalOpSource;
var Op = Swarm.Op;
var tape = require('tap').test;

tape ('syncable.08.A basic cases', function(t){
    var pipe = new LocalOpSource();
    t.plan(4);
    pipe.on('handshake', function (hsop){
        t.equal(hsop.spec.toString(), hs);
    });
    pipe.on('op', function (op){
        t.equal(op.spec.toString(), ops);
        t.equal(op.value, opv);
    });
    pipe.on('end', function (errop){
        t.equal(errop.value, err);
        t.end();
    });
    var hs = '/Swarm#id!stamp.on';
    var ops = '/Model#id!stamp.set';
    var opv = '<val>';
    var err = 'error!';
    pipe.pair.writeHandshake(new Op(hs, '', null));
    pipe.pair.writeOp(new Op(ops, opv, null));
    pipe.pair.writeEnd(err);

});
