"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const tap = require('tap').test;
const LevelOp = require('../src/LevelOp');
const LevelDOWN = require('leveldown');
const PeerOpStream = require('../src/PeerOpStream');
const rimraf = require('rimraf');
const Spec = swarm.Spec;
const Op = swarm.Op;


class StashOpStream extends sync.OpStream {

    constructor () {
        super();
        this.stash = [];
    }

    _apply (op) {
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

    const peer = new PeerOpStream(new LevelDOWN('.peer.02.A'), {}, (err, log) => {
        if (err) { return t.fail() && t.end(); }

        log._debug = 'P';
        log.on(tray);
        log.offerAll(ops);
        setTimeout(checkTray, 100);

    });


    function checkTray () {

        let emitted = tray.stash;

        //emitted.forEach(op=>console.log('emit: '+ op.toString()));
        console.warn(emitted.join('\n'));

        t.equals(emitted.length, 5);

        peer.db.scan(new Spec('/LWWObject#test+replica'), null, op=>list.push(op), checkDB);

    }

    function checkDB () {

        //list.forEach(op=>console.log('DB: '+ op.toString()));

        t.equals(list.length, 3);

        t.end();
        rimraf.sync('.peer.02.A');

    }

});



