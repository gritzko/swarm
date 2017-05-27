"use strict";
const protocol = require('..');
const Id = protocol.Id;
const Spec = protocol.Spec;
const Op = protocol.Op;
const Ids = protocol.Ids;
const Ops = protocol.Ops;
const tap = require('tape').test;

const ops_str = [
    "#stamp0-author.type@stamp0-author:~state",
    "#stamp0-author.type@stamp1-author:locA=1",
    '#stamp0-author.type@stamp2-author:locB="2"',
    "#stamp0-author.type@stamp3-author:locC=[3]",
    '#stamp0-author.type@stamp4-other:locD={"four":5}',
    ''
    ].join('\n');

const ops = Op.parseFrame(ops_str);
const op0 = ops[0], op1 = ops[1], op2 = ops[2], op3 = ops[3], op4 = ops[4];

tap ('protocol.08.A ops create and read', function(tap) {

    const the_ops = Ops.fromOpArray(ops);

    let i = 0;
    for (let op of the_ops) {
        tap.equal( op.toString(), ops[i++].toString() );
    }

    const json = the_ops.toJSON();
    tap.deepEqual(json.v, [null, 1, "2", [3], {"four":5}]);
    tap.equal(json.s, "@stamp-author@stamp1-author'23@stamp4-other", 'stamps');
    tap.equal(json.l, ":~state:locA'BCD", 'locs');

    // const rehydrated = Ops.fromString(the_ops.toString());
    // i = 0;
    // for (let op of rehydrated) {
    //     tap.ok( op.eq( ops[i++] ) );
    // }

    const four = the_ops.splice(2, 2, [op0]);
    tap.deepEqual(four.values, [null, 1, null, {"four":5}], 'value splice');
    tap.equal( four.at(3).stamp, op4.stamp );

    tap.end();

});

function lww_reducer (state, op) {
    if (!state)
        state = new Op(op.Id, op.Type, Id.ZERO, Spec.DIFF_OP_NAME);
    let ops = Ops.fromOp(state);
    const i = ops.findLoc(op.Location);
    if (i===-1)
        ops = ops.splice(ops.length, 0, [op]);
    else if (ops.at(i).Stamp.lt(op.Stamp))
        ops = ops.splice(i, 1, [op]);
    return new Op(
        state.Id,
        state.Type,
        op.Stamp,
        state.Event,
        ops.toJSON()
    );
}

class LWWSyncable {
    constructor (state) {
        this._state = state;
        this._ops = null;
    }
    get ops () {
        if (this._ops===null)
            this._ops = Ops.fromOp(this._state);
        return this._ops;
    }
    get (key) {
        const i = this.ops.findLoc(key);
        return i===-1 ? undefined : this.ops.at(i).Value;
    }
}

tap ('protocol.08.B reducer', function(tap) {

    const state1 = lww_reducer(op0, op1);
    const state2 = lww_reducer(state1, op2);
    const state3 = lww_reducer(state2, op3);
    const state4 = lww_reducer(state3, op4);

    const sync = new LWWSyncable(state4);
    tap.equal( sync.get("locB"), "2" );

    tap.end();

});


tap ('protocol.08.C iterator', function (tap) {

    const ops = Op.parseFrame([
        '#test.db@time01-U:~on+Ureplica='+
        '{"s":"@0time-U@0time1+U","l":":Clock:ClockLen","v":["Logical",5]}'
    ].join('\n')+'\n');

    tap.equal(ops.length, 1);

    const state = ops[0];

    const uncompressed = Ops.fromOp(state);

    tap.equal(uncompressed.length, 2, 'length');

    const array = [];

    for(let o of uncompressed)
        array.push(o);

    tap.equal(array.length, 2);

    const clock = array[0];
    const clock_len = array[1];

    tap.ok(clock.isSameObject(clock_len));
    tap.equal(clock.id, 'test');
    tap.equal(clock.stamp, '0time-U');
    tap.equal(clock.loc, 'Clock');
    tap.equal(clock.Value, 'Logical');
    tap.equal(clock_len.stamp, '0time1-U');
    tap.equal(clock_len.loc, 'ClockLen');
    tap.equal(clock_len.Value, 5);

    tap.end();

});