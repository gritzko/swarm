"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const tap = require('tap').test;
const LevelOp = require('../src/LevelOp');
const LevelDOWN = require('leveldown');
const PatchOpStream = require('../src/PatchOpStream');
const rimraf = require('rimraf');
const Spec = swarm.Spec;
const Op = swarm.Op;
const async = require('async');

tap ('peer.03.A patches', function(t) {

    let ops = swarm.Op.parseFrame([
        '/LWWObject#test+replica!now01+A.key 1',
        '/LWWObject#test+replica!now0100001+B.key+now 2',
        '/LWWObject#test+replica!now0100001+B.~+now !now+B.key 2',
        '/LWWObject#test+replica!now02+A.key 3',
        ''
    ].join('\n'));

    let ons = swarm.Op.parseFrame([
        '/LWWObject#test+replica!now+B.on+C',
        '/LWWObject#test+replica!0.on+D',
        ''
    ].join('\n'));

    rimraf.sync('.peer.00.A');
    var db, patch;

    async.waterfall([
            next => db = new LevelOp( new LevelDOWN('.peer.03.A'), {}, next),
            next => db.putAll(ops, next),
            next => { patch = new PatchOpStream(db); next(); },
            next => { patch.offerAll(ons); setTimeout(next, 400); }, // FIXME
            next => {
                let emitted = patch.spill();
                //emitted.forEach(o=>console.log(''+o));

                t.equal(emitted.length, 4);

                t.equal(emitted[0].spec.stamp, 'now02+A');
                t.equal(emitted[0].spec.name, 'key+C');
                t.equal(emitted[1].spec.stamp, 'now02+A');
                t.equal(emitted[1].spec.name, 'on+C');

                t.equal(emitted[2].spec.stamp, 'now02+A');
                t.equal(emitted[2].spec.name, '~+D');
                t.equal(emitted[3].spec.stamp, 'now02+A');
                t.equal(emitted[3].spec.name, 'on+D');

                next();
            }
            //next => db.scan(Spec.ZERO, Spec.ERROR, op=>console.log(':'+op), next)
        ],
        err => {
            rimraf.sync('.peer.03.A');
            if (err)
                t.fail(err);
            t.end();
        });

/*
    patch.offer(new Op('/LWWObject#test+replica!0.on+C', ''));
    patch.offer(new Op('/LWWObject#test+replica!now+B.on+D', ''));
    patch.offer(new Op('/LWWObject#test+replica!now01+A.on+E', ''));
    patch.offer(new Op('/LWWObject#test+replica!now02+A.on+F', ''));
    patch.offer(new Op('/LWWObject#test+replica!now+B.on+G', ''));
*/
});