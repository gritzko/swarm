"use strict";
let tape = require('tap').test;
let swarm = require('swarm-protocol');
let OpStream = require('../src/OpStream');
let Op = swarm.Op;

tape ('syncable.00.A echo op stream - event filtering', function (t) {

    // OpStream is a semi-abstract base class, an echo stream
    let stream = new OpStream();
    // ops to emit
    let ops = Op.parseFrame(
        "/Swarm#test!time.off\n" +
        "/Object#7AM0f+gritzko!0.on\n" +
        "/Object#7AM0f+gritzko!7AM0f+gritzko.~\n" +
        "/Object#7AM0f+gritzko!7AM0f+gritzko.key\tvalue\n"
    );

    let ons = 0, onoffs = 0, states = 0, mutations = 0, myobj = 0;
    let unsub = false;

    // OK, let's play with filters and listeners
    // the syntax for the filters is the same as for Specs,
    // except each token may have many accepted values (OR)
    // Different tokens are AND'ed.

    stream.on(".on", op => ons++);

    // may use stream.onHandshake(op => onoffs++)
    // means: ".on OR .off"
    stream.on(".on.off", op => onoffs++);

    // may use stream.on(".~", op => states++)
    stream.onState(op => states++);

    // may use stream.onMutation(op=> mutations++)
    // the leading ^ is a negation, i.e "NOT (.on OR .off OR ...)"
    stream.on("^.on.off.error.~", op=> mutations++);

    // filters database close event, ".off AND /Swarm"
    stream.on("/Swarm.off", op=> unsub=true);

    // this catches a fresh subscription to #7AM0f+gritzko
    stream.on("/Object#7AM0f+gritzko!0", on => {
        myobj++;
        t.ok(on.isOn());
    });

    // may use stream.on ( null, () => {...} )
    stream.onEnd(nll => {
        t.equals(nll, null);
        t.equals(ons, 1);
        t.equals(onoffs, 2);
        t.equals(mutations, 1);
        t.equals(myobj, 1);
        t.ok(unsub);
        t.end();
    });

    // feed all the ops into the echo stream to trigger listeners
    stream.offerAll(ops);
    // stream.offer(null) has the same effect as stream.end()
    stream.end();

});