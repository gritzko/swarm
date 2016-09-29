"use strict";
let tap = require('tap').test;
let swarm = require('swarm-protocol');
let Op = swarm.Op;
let SwarmMeta = require('../src/Swarm');
let Client = require('../src/Client');
//let FakeClient = require('./FakeClient');
let OpStream = require('../src/OpStream');
let LWWObject = require('../src/LWWObject');


tap ('syncable.02.A SwarmMeta API', function (t) {

    let host = new Client('/Swarm#test', new OpStream());
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


tap ( 'syncable.02.B Client add/removeSyncable API', function (t) {

    // by default, a Client has a {map} as a backing storage and no upstream
    let host = new Client('/Swarm#test!0+replica');
    // FIXME
    host._clock = new swarm.Clock('replica', {Clock: 'Logical'});

    // by-value constructor
    let props = new LWWObject({key: "value"});
    host.addNewSyncable(props);
    // write stamping
    t.equals(props.get('key'), 'value');
    let stamp = props.StampOf('key');
    t.equals(stamp.origin, '0');
    props.set('key', 'new value');
    t.equals(props.get('key'), 'new value');
    t.equals(props.StampOf('key').origin, 'replica');

    // the op gets some logical timestamp not far from zero
    t.ok(stamp.value < '000000000A');
    props.set('key', 'value2');
    t.equals(props.get('key'), 'value2');
    t.ok(stamp.lt(props.StampOf('key')));
    props.set('key', 'value3');
    t.equals(props.get('key'), 'value3');
    // by-id constructor, duplicate prevention
    let porps = host.getBySpec(props.spec);
    t.ok(porps===props);
    props.close();
    t.throws(function () { // the object is closed
        props.set('key', 'fails');
    });

    let props2 = host.getBySpec(props.spec);
    t.ok(props!==props2);
    t.ok(props2.get('key')===undefined); // NO STORAGE synchronous state load
    host.close();
    t.throws(function () { // the host and the object are closed
        props2.set('key', 'fails');
    });

    t.end();

});