"use strict";
let tape = require('tap').test;
let swarm = require('swarm-protocol');
let OpStream = require('../src/OpStream');
let Op = swarm.Op;

tape ('syncable.00.A echo op stream - event filtering', function (t) {

    let stream = new OpStream();
    let ops = Op.parseFrame(
        "/Swarm#test!time.off\n" +
        "/Object#7AM0f+gritzko!0.on\n" +
        "/Object#7AM0f+gritzko!7AM0f+gritzko.~\n" +
        "/Object#7AM0f+gritzko!7AM0f+gritzko.key\tvalue\n"
    );

    let ons = 0, onoffs = 0, states = 0, mutations = 0, myobj = 0;
    let unsub = false;

    stream.on(".on", op => ons++);
    stream.on(".on.off", op => onoffs++);
    stream.on(".~", op => states++);
    stream.on("^.on.off.error.~", op=> mutations++);
    stream.on("/Swarm.off", op=> unsub=true);
    stream.on("/Object#7AM0f+gritzko!0", on => {
        myobj++;
        t.ok(on.isOn());
    });

    stream.onEnd(nll => {
        t.equals(nll, null);
        t.equals(ons, 1);
        t.equals(onoffs, 2);
        t.equals(mutations, 1);
        t.equals(myobj, 1);
        t.ok(unsub);
        t.end();
    });

    stream.offerAll(ops);
    stream.offer(null);

});