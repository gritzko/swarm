"use strict";
var swarm = require('..');
var tape = require('tap').test;
var Op = swarm.Op;


tape ('protocol.04.A parse ops', function (tap) {

    var parsed = Op.parseFrame (
        '/Swarm#test!timeX+author~ssn.on=\n'+
        '\tKey1: value1\n' +
        ' Key2: value2\n' +
        '/Model#id!stamp.set\t{"x":"y"}\n' +
        '/Model#other!stamp.on\n'+
        '/Model#other!stamp.~\n' +
        '/Model#other!stamp.0\n'
    );

    tap.equal(parsed.length, 5);
    var multi = parsed[0];
    var set = parsed[1];
    var short_on = parsed[2];
    var state = parsed[3];
    var noop = parsed[4];

    tap.equal(set.name, 'set');
    tap.equal(set.value, '{"x":"y"}');

    tap.equal(multi.spec.origin, 'author~ssn', 'originating session');
    tap.equal(multi.spec.stamp, 'timeX+author~ssn', 'lamport tim.stamp');
    tap.equal(multi.spec.id, 'test', '#id');
    tap.equal(multi.spec.name, 'on', 'name');
    tap.equal(''+multi.spec.Stamp, 'timeX+author~ssn', 'version');
    tap.equals( multi.value.replace(/[^\n]/mg,'').length, 1 );

    tap.ok ( state.isState() );
    tap.ok ( state.isSameObject(short_on) );
    tap.ok ( noop.isNoop() );
    tap.notOk ( state.isNoop() );
    tap.notOk ( noop.isState() );
    tap.notOk ( noop.isSameObject(set) );

    tap.equal(multi.toString(),
        '/Swarm#test!timeX+author~ssn.on=\n'+
        '\tKey1: value1\n' +
        '\tKey2: value2',
    'multiline serialization');

    tap.equal(short_on.toString(), '/Model#other!stamp.on');
    tap.equal(short_on.value, '');
    tap.equal(short_on.name, 'on');
    tap.ok( short_on.spec.Type.isTranscendent() );

    tap.end();

});

