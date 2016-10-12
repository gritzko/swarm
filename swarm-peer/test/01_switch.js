"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const tap = require('tap').test;
const OpStream = sync.OpStream;
const SwitchOpStream = require('../src/SwitchOpStream');
const Spec = swarm.Spec;
const Op = swarm.Op;
const ZOS = OpStream.ZeroOpStream;

tap ('peer.01.A switch basic test', function(t) {

    let ops = swarm.Op.parseFrame([
        '/Swarm#test!0.on+R',
        '/Swarm#test!now.~+R=\n\t!2.Clock "Logical"\n\t!3.DBIdScheme "0172"',
        '/Swarm#test!now.on+R',
        '/Swarm#test!0.on+0client {"Password": 1}',
        '/~Client#0client!ago.~+R !2.Password 1',
        '/~Client#0client!ago.on+R',
        '/LWWObject#id!0.on+Rclient001',
        '/LWWObject#id!now00+Rclient001.op',
        '/LWWObject#id!now00+Rclient001.off+Rclient001',
        '/LWWObject#id!now01+Rclient001.op',
        ''
    ].join('\n'));

    const sw_on0 = ops.shift();
    const log_meta_op = ops.shift();
    const log_reon = ops.shift();
    const client_on = ops.shift();
    const log_client = ops.shift();
    const log_client_reon = ops.shift();

    let ready = false;
    const client = new ZOS();
    const log = new ZOS();
    const x = new SwitchOpStream( "test+R", log, {debug: 'S'}, err => {
        t.equals(err, undefined);
        ready=true;
    } );

    t.notOk(ready);
    const hson = log.offered.pop();
    t.ok(hson.isHandshake());
    t.equals(hson+'', sw_on0+'');
    log._emit(log_meta_op);
    t.ok(ready);
    log._emit(log_reon);

    x.on(client);
    x.offer(client_on, client);

    const client_sw_on = log.offered.pop();
    t.equals(client_sw_on.id, '0client');
    log._emit(log_client);
    log._emit(log_client_reon);

    log.offer = function (op) {
        this._emit(op);
    };
    ops.forEach( o => x.offer(o, client) );
    setTimeout(check, 100);

    function check() {

        let re = client.applied;

        console.warn(re.toString());
        t.equals(re.length, 3);

        t.equals(re[0]+'', ops[0]+'');
        t.equals(re[1]+'', ops[1]+'');
        t.equals(re[2]+'', ops[2]+'');

        //re.forEach(op => console.log(op+''));

        t.end();

    }

});