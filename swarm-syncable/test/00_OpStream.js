"use strict";
let tape = require('tape').test;
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

    let ons = 0, onoffs = 0, states = 0;
    let mutationsA = 0, mutationsB = 0, myobj = 0;
    let unsub = false;

    // OK, let's play with filters and listeners
    // the syntax for the filters is the same as for Specs,
    // except each token may have many accepted values (OR)
    // Different tokens are AND'ed.

    stream.onMatch(".on", op => ons++);

    // may use stream.onHandshake(op => onoffs++)
    // means: ".on OR .off"
    stream.onMatch(".on.off", op => onoffs++);

    // may use stream.on(".~", op => states++)
    stream.onState(op => states++);

    // the leading ^ is a negation, i.e "NOT (.on OR .off OR ...)"
    stream.onMatch("^.on.off.error.~", op=> mutationsA++);
    // exactly the same result, without the mumbo-jumbo:
    stream.onMutation(op=> mutationsB++);

    // filters database close event, ".off AND /Swarm"
    stream.onMatch("/Swarm.off", op=> unsub=true);

    // this catches a fresh subscription to #7AM0f+gritzko
    stream.onMatch("/Object#7AM0f+gritzko!0", on => {
        myobj++;
        t.ok(on.isOn());
    });

    // may use stream.on ( null, () => {...} )
    stream.onceEnd(nothing => {
        t.equals(nothing, null);
        t.equals(ons, 1);
        t.equals(onoffs, 2);
        t.equals(mutationsA, 1);
        t.equals(mutationsB, 1);
        t.equals(myobj, 1);
        t.ok(unsub);
        t.end();
    });

    // feed all the ops into the echo stream to trigger listeners
    stream.offerAll(ops);
    // stream.offer(null) has the same effect as stream.end()
    stream.offer(null);

    // in case you'll need to debug that, v8 is awesome:
    // console.log(stream._listFilters());
    //
    // .on	op => ons++
    // .on.off	op => onoffs++
    // .~	op => states++
    // ^.on.off.error.~	op=> mutationsA++
    // ^.on.off.error.~	op=> mutationsB++
    // /Swarm.off	op=> unsub=true
    //     /Object#7AM0f+gritzko!0	on => {
    //     myobj++;
    //     t.ok(on.isOn());
    // }
    // null	nothing => {
    //     t.equals(nothing, null);
    //     t.equals(ons, 1);
    //     t.equals(onoffs, 2);
    //     t.equals(mutationsA, 1);
    //     t.equals(mutationsB, 1);
    //     t.equals(myobj, 1);
    //     t.ok(unsub);
    //     t.end();
    // }

});


tape ('syncable.00.A echo op stream - listener mgmt', function (t) {

    let ops = Op.parseFrame (".on\n.off\n/Swarm.on\tvalue\n.off\n");

    let stream = new OpStream();

    let once = 0, ons = 0, first_on = false;
    let total = 0, total2 = 0, before_value = 0, three=0;

    stream.on(op => total++);
    stream.on(op => total2++);
    stream.onceMatch('.on', op => once++ );
    stream.onMatch('.on', () => ons++ );
    stream.onMatch('.on', op => {
        first_on = true;
    });
    stream.on( op => {
        if (op && op.value)
            return OpStream.ENOUGH;
        before_value++;
    });
    const handle = stream.on(function removable (op) {
        three++;
        if (op.type=='Swarm')
            stream.off(handle);
    });

    stream.offerAll(ops);
    stream.end();

    t.equals(once, 1);
    t.equals(ons, 2);
    t.equals(total, 5);
    t.equals(total2, 5);
    t.equals(before_value, 2);
    t.equals(three, 3);
    t.ok(first_on);

    t.end();

});

tape ('syncable.00.B op stream - filter', function (t) {

    let filter = '^/Swarm.off';

    let f = new OpStream.Filter(filter, t.end);

    t.equals(f.toString(), filter);

    t.end();
    //let ops = Op.parseFrame ("/Swarm.off\n/Swarm.on\n");

});

tape ('syncable.00.C op stream - queue', function (t) {
    let stream = new OpStream();
    stream._lstn = [];
    let count = 0, tail = 0;
    stream.offer(Op.NOTHING);
    stream.offer(Op.NOTHING);
    stream.on(op => count++);
    stream.on(op => tail++);
    stream.offer(Op.NOTHING);
    t.equals(count, 3);
    t.equals(tail, 1);
    stream._lstn = null; // only pool ops if lstn is []
    stream.offer(Op.NOTHING);
    t.equals(count, 3);
    t.equals(tail, 1);
    t.end();
});

tape ('syncable.00.D op stream URL', function (t) {
    const zero = OpStream.connect('0://00.D');
    t.ok(zero===OpStream.QUEUES['00.D']);
    zero.offer(Op.NON_SPECIFIC_NOOP);
    t.equals(zero.ops.length, 1);
    t.ok(zero.ops[0]===Op.NON_SPECIFIC_NOOP);
    t.end();
});
