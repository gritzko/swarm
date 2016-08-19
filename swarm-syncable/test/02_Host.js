"use strict";
let tap = require('tap').test;
let swarm = require('swarm-protocol');
let Op = swarm.Op;
let SwarmMeta = require('../src/SwarmMeta');
let Host = require('../src/Host');
//let FakeHost = require('./FakeHost');
let OpStream = require('../src/OpStream');


tap ('syncable.02.A SwarmMeta API', function (t) {

    let host = new Host('/Swarm#test', new OpStream());
    let p = new SwarmMeta(host);
    t.equals(p.get('Clock'), undefined);
    p.set('Clock', 'Logical');
    t.equals(p.get('Clock'), 'Logical');
    p.set('ClockOffst', -12345);
    t.equals(p.get('ClockOffst'), -12345);
    p.set('Object', 'hi');
    t.equals(p.get('Object'), 'hi');
    t.throws(function () {
        p.set('New\nLine', 'abc');
    });
    t.throws(function () {
        p.set('', 'abc');
    });
    t.end();

});


tap ( 'syncable.02.B Host add/removeSyncable API', function (t) {

    // by default, a Host has a {map} as a backing storage and no upstream
    let host = new Host('/Swarm#test!0+replica', {Clock: 'Logical'});

    // by-value constructor
    let props = new Properties({key: "value"}, host);
    // write stamping
    t.equals(props.get('key'), 'value');
    let stamp = props.stampOf('key');
    t.equals(stamp.origin, 'replica');
    // the op gets some logical timestamp not far from zero
    t.ok(stamp.value < '000000000A');
    props.set('key', 'value2');
    t.equals(props.get('key'), 'value2');
    t.ok(stamp.lt(props.stampOf('key')));
    props.set({'key': 'value3'});
    t.equals(props.get('key'), 'value3');
    // by-id constructor, duplicate prevention
    let porps = new Properties(props.id, host);
    t.ok(porps===props);
    props.close();
    t.throws(function () { // the object is closed
        props.set('key', 'fails');
    });

    let props2 = new Properties(props.id, host);
    t.ok(props!==props2);
    t.equals(props2.get('key'), 'value3'); // synchronous state load
    host.close();
    t.throws(function () { // the host and the object are closed
        props2.set('key', 'fails');
    });

    t.end();

});