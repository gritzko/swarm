"use strict";
let tape = require('tape').test;
let swarm = require('swarm-protocol');
let OpStream = require('../src/OpStream');
const Spec = swarm.Spec;
let Op = swarm.Op;

tape ('syncable.00.A echo op stream - event filtering', function (t) {

    // OpStream is a semi-abstract base class, an echo stream
    let stream = new OpStream();
    // ops to emit
    let ops = Op.parseFrame(
        "#test.db@time:~off\n" +
        "#7AM0f+gritzko.json@0:~on\n" +
        "#7AM0f+gritzko.json@7AM0f12+origin:num=1\n" +
        '#7AM0f+gritzko.json@7AM0f+gritzko:key="value"\n'
    );

    let ons = 0, onoffs = 0;
    let origin = 0, mutationsB = 0, myobj = 0;
    let unsub = 0;

    // OK, let's play with filters and listeners
    // the syntax for the filters is the same as for Specs,
    // except each token may have many accepted values (OR)
    // Different tokens are AND'ed.

    stream.onEvent(Op.ON_OP_NAME, op => ons++);

    stream.onOrigin("origin", op => origin++);

    // may use stream.onHandshake(op => onoffs++)
    // means: ".on OR .off"
    stream.onOnOff(op => onoffs++);

    // the leading ^ is a negation, i.e "NOT (.on OR .off OR ...)"
    //stream.ontch("^.on.off.error.~", op=> mutationsA++);
    // exactly the same result, without the mumbo-jumbo:
    stream.onMutation (op => mutationsB++);

    // filters database close event, ".off AND /Swarm"
    stream.onHandshake().onType("db", op=> unsub++);

    // this catches a fresh subscription to #7AM0f+gritzko
    stream.onId("7AM0f+gritzko").onType("json", on => {
        myobj++;
    });

    // may use stream.on ( null, () => {...} )
    stream.onceEnd(nothing => {
        t.equals(nothing, null, 'null');
        t.equals(ons, 1, 'onEvent');
        t.equals(onoffs, 2, 'onOnOff');
        t.equals(origin, 1, 'onOrigin');
        t.equals(mutationsB, 2, 'onMutation');
        t.equals(myobj, 3, 'onId().onType()');
        t.equals(unsub, 1, 'onHandshake.onType');
        t.end();
    });

    // feed all the ops into the echo stream to trigger listeners
    ops.forEach( o => stream._emitted(o) );
    // stream.offer(null) has the same effect as stream.end()
    stream._emitted(null);

});


tape ('syncable.00.A echo op stream - listener mgmt', function (t) {

    let ops = Op.parseFrame (':~on\n:~off\n#test.db:~on="value"\n:~off\n');

    let stream = new OpStream();

    let once = 0, ons = 0, first_on = false;
    let total = 0, total2 = 0, before_value = 0, three=0;

    stream.on(op => total++);
    stream.on(op => total2++);
    stream.onceEvent(Spec.ON_OP_NAME, op => once++ );
    stream.onEvent(Spec.ON_OP_NAME, () => ons++ );
    stream.onEvent(Spec.ON_OP_NAME, op => {
        first_on = true;
    });
    stream.on( op => {
        if (op && op.value)
            return OpStream.ENOUGH;
        before_value++;
    });
    const handle = stream.on(function removable (op) {
        three++;
        if (op.type=='db')
            stream.off(handle);
    });

    stream.emitAll(ops);
    stream.emit(null);

    t.equals(once, 1, 'once');
    t.equals(ons, 2);
    t.equals(total, 5, 'total');
    t.equals(total2, 5, 'total(2)');
    t.equals(before_value, 2);
    t.equals(three, 3);
    t.ok(first_on);

    t.end();

});


tape ('syncable.00.D op stream URL', function (t) {
    const zero = OpStream.connect('0://00.D');
    t.ok(zero===OpStream.QUEUES['00.D']);
    zero._committed(Op.NON_SPECIFIC_NOOP);
    t.equals(zero.ops.length, 1);
    t.ok(zero.ops[0]===Op.NON_SPECIFIC_NOOP);
    t.end();
});
