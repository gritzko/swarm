"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const tap = require('tap').test;
const LevelOp = require('../src/LevelOp');
const SwarmDB = require('../src/SwarmDB');
const LevelDOWN = require('leveldown');
const LogOpStream = require('../src/LogOpStream');
const rimraf = require('rimraf');
const Spec = swarm.Spec;
const Op = swarm.Op;


class StashOpStream extends sync.OpStream {

    constructor () {
        super();
        this.stash = [];
    }

    offer (op) {
        this.stash.push(op);
    }

}

tap ('peer.02.A op log append basics', function(t) {

    let ops = swarm.Op.parseFrame([
        '/LWWObject#test+replica!now01+A.op',
        '/LWWObject#test+replica!now00+B.op',
        '/LWWObject#test+replica!now01+A.op',
        '/LWWObject#test+replica!now02+A.op',
        '/LWWObject#test+replica!0.on+C',
        ''
    ].join('\n'));

    let tray = new StashOpStream();
    let list = [];

    rimraf.sync('.peer.02.A');
    let db = new SwarmDB("test", new LevelDOWN('.peer.02.A'), {}, () => {

        let log = new LogOpStream(db, (err) => {
            if (err) { return t.fail() && t.end(); }

            log.pipe(tray);
            log.offerAll(ops);
            setTimeout(checkTray, 100);

        });

    });

    function checkTray () {

        let emitted = tray.stash;

        //emitted.forEach(op=>console.log('emit: '+ op.toString()));

        t.equals(emitted.length, 5);
        t.ok(emitted[2].isError());

        db.scan(new Spec('/LWWObject#test+replica'), null, op=>list.push(op), checkDB);

    }

    function checkDB () {

        //list.forEach(op=>console.log('DB: '+ op.toString()));

        t.equals(list.length, 3);

        t.end();
        rimraf.sync('.peer.02.A');

    }

});



