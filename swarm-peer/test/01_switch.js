"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const tap = require('tap').test;
const LevelOp = require('../src/LevelOp');
const SwitchOpStream = require('../src/SwitchOpStream');
const LevelDOWN = require('leveldown');
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
tap ('peer.01.A switch basic test', function(t) {

    let ops = swarm.Op.parseFrame([
        '/Type#id!0.on+client',
        '/Type#id!now00+client.op',
        '/Type#id!now00+client.off+client',
        '/Type#id!now01+client.op',
        ''
    ].join('\n'));

    rimraf.sync('.peer.01.A');

    let client = new StashOpStream();
    let x = null;
    let ld = new LevelDOWN('.peer.01.A');
    let db = new LevelOp(ld, {}, () => {
        x = new SwitchOpStream(db);
        //x._debug = 'S';
        x.addClient(client, new swarm.Stamp("0+client"));
        let fake_log = new sync.OpStream();
        x.pipe(fake_log);
        fake_log.pipe(x);
        client._emitAll(ops);
        setTimeout(check, 400);
    });

    function check() {

        let re = client.stash;

        t.equals(re.length, 3);

        re.forEach(op => console.log(op+''));

        t.end();

        rimraf.sync('.peer.01.A');

    }

});