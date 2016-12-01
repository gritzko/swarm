"use strict";
const swarm = require('..');
const tape = require('tape').test;
const Op = swarm.Op;
const Id = swarm.Id;
const Spec = swarm.Spec;


tape ('protocol.04.A parse ops', function (tap) {

    const empty = new Op();
    tap.equal(empty.toString(), ':0');

    const json_op = new Op(Id.ZERO, Id.ZERO, Id.ZERO, Id.ZERO, {a:1});
    tap.equal(json_op.toString(), ':0={"a":1}');

    var parsed = Op.parseFrame (
        '#test.db@timeX-author~ssn:on={"Key1":"value1","Key2":"value2"}\n'+
        '#id.json@timeY-author:X="Y"\n' +
        '#other.json@timeZ-author:~on\n'+
        '#other.json@timeZ-author:~state={}\n' +
        '#other.json@timeZ-author:0="invalid\n\n'
    );

    tap.equal(parsed.length, 5);

    const serial = Op.serializeFrame(parsed);
    tap.equal(serial,
        '#test.db@timeX-author~ssn:on={"Key1":"value1","Key2":"value2"}\n'+
        '#id.json@timeY-author:X="Y"\n' +
        '#other@timeZ-author:~on\n'+
        ':~state={}\n' +
        ':0="invalid\n\n'
    );

    var multi = parsed[0];
    var set = parsed[1];
    var short_on = parsed[2];
    var state = parsed[3];
    var noop = parsed[4];

    tap.equal(set.eventName, 'X');
    tap.equal(set.value, 'Y');

    tap.equal(multi.origin, 'author~ssn', 'originating session');
    tap.equal(multi.stamp, 'timeX-author~ssn', 'lamport tim.stamp');
    tap.equal(multi.id, 'test', '#id');
    tap.equal(multi.eventName, 'on', 'name');
    tap.equal(''+multi.Stamp, 'timeX-author~ssn', 'version');
    tap.equals( multi.value.Key1, "value1" );
    tap.equals( multi.value.Key2, "value2" );

    tap.ok ( state.isState(), "isState" );
    tap.ok ( state.isSameObject(short_on) );
    tap.ok ( noop.isNoop() );
    tap.notOk ( state.isNoop() );
    tap.notOk ( noop.isState() );
    tap.notOk ( noop.isSameObject(set) );

    tap.equal(multi.toString(),
        '#test.db@timeX-author~ssn:on={"Key1":"value1","Key2":"value2"}',
        'serialization');

    tap.equal(short_on.toString(), '#other.json@timeZ-author:~on');
    tap.equal(short_on.value, null);
    tap.equal(short_on.name, '~on');
    tap.ok( short_on.spec.Type.isTranscendent() );

    tap.equal(noop.value, null); // invalid value, ignored

    tap.end();

});

tape ('protocol.04.B ops - mutators', function (tap) {

    const empty = new Op();
    const scoped = empty.scoped('R');
    tap.equal(scoped.toString(), ':0-R')
    const stamped = empty.stamped('time-origin');
    tap.equal(stamped.toString(), '@time-origin')
    const named = stamped.named(Spec.ERROR_OP_NAME);
    tap.equal(named.toString(), '@time-origin:~~~~~~~~~~')
    const error = stamped.error('message', 'R');
    tap.equal(error.toString(), "@time-origin:~~~~~~~~~~-R=\"message\"");
    const zero = Op.zeroStateOp("#id.type");
    tap.equal(zero.toString(), "#id.type:~state");

    tap.end();

});