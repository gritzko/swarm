"use strict";
const swarm = require('swarm-protocol');
const tap = require('tap').test;
const LevelOp = require('../src/LevelOp');
const LevelDOWN = require('leveldown');
const rimraf = require('rimraf');
const Spec = swarm.Spec;
const Op = swarm.Op;
const async = require('async');


tap ('peer.00.A leveldb read-write test', function(t){

    let ops = swarm.Op.parseFrame( [
        '/LWWObject#test+replica!now01+replica.op',
        '/LWWObject#test+replica!now02+replica.op',
        '/LWWObject#test1+replica!now03+replica.op',
        ''
        ].join('\n') );

    let found = [], found1 = [], reverse = [];
    let db;
    let total = 0;
    rimraf.sync('.peer.00.A');


    async.waterfall([
        (next) =>db = new LevelOp(new LevelDOWN('.peer.00.A'), next),
        (next) =>db.putAll(ops, next),
        (next) =>db.put (new Op('/LWWObject#test1+replica!now04+replica.op', ''), next),
        (next) =>db.scan(new Spec('/LWWObject#test1+replica'), null,
                        op => reverse.push(op), next, {reverse: true}),
        (next) =>{
            t.equal(reverse.length, 2);
            t.equal(reverse[0].spec.time, 'now04');
            t.equal(reverse[1].spec.time, 'now03');
            next();
        },
        (next) =>{
            let from = new Spec('/LWWObject#test+replica!now02+replica.op');
            // 2 parallel scans
            let count = 0;
            var join = () =>++count===2 && next();
            db.scan(from, null, op=> found.push(op), join);
            db.scan(Spec.ZERO, Spec.ERROR, op=> total++, join);
        },
        (next) =>{
            t.equals(total, 4);
            t.equals(found.length, 1);
            t.equals(found[0].spec.toString(), '/LWWObject#test+replica!now02+replica.op');
            next();
        },
        (next) =>db.get(Spec.ZERO, nothing => {
            t.equals(nothing, null);
            next();
        }),
        (next) =>db.scan(new Spec('/LWWObject#test1+replica!now03+replica.op'), null, op => {
            t.equals(op.id, 'test1+replica');
            found1.push(op);
        }, next),
        (next) =>{
            t.equals(found1.length, 2);
            next();
        }
    ], (err) => {
        rimraf.sync('.peer.00.A');
        if (err)
            t.fail(err);
        t.end();
    });

});
