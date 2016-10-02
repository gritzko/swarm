"use strict";
const tap = require('tape').test;
const swarm = require('swarm-protocol');
const Op = swarm.Op;
const Client = require('../src/Client');
//const FakeClient = require('./FakeClient');
const OpStream = require('../src/OpStream');
const LWWObject = require('../src/LWWObject');


tap ('syncable.02.A SwarmMeta API', function (t) {

    const ops = Op.parseFrame([
        '/Swarm#test!0.on',
        '/Swarm#test!time.~+ReplicaSSN !1.Clock "Logical"',
        '/Swarm#test!time.on+ReplicaSSN',
        ''
    ].join('\n'));

    let host = new Client('swarm+0://02.A/test');
    let meta = host.meta;

    t.notOk(meta.hasState());
    t.notOk(host.time());
    t.equals(meta.get('Clock'), undefined);

    const upstream = OpStream.QUEUES['02.A'];
    t.equals(upstream.ops.length, 1);
    t.equals(upstream.ops.shift()+'', ops[0]+'');

    upstream._emit(ops[1]);
    t.equals(meta.get('Clock'), 'Logical');
    t.ok(meta.hasState());
    t.equals(host.time().toString(), 'time01+ReplicaSSN');
    upstream._emit(ops[2]);
    t.equals(host.time().toString(), 'time02+ReplicaSSN');

    t.end();

});


tap ( 'syncable.02.B Client add/removeSyncable API', function (t) {

    const ops = Op.parseFrame([
        '/Swarm#test!0.on+0eplica Password: 1',
        '/Swarm#test!time.~+ReplicaSSN !1.Clock "Logical"',
        '/Swarm#test!time.on+ReplicaSSN',
        '/LWWObject#time02+ReplicaSSN!time02+ReplicaSSN.~=\n\t!time03+ReplicaSSN.key\t"value"',
        '/LWWObject#time02+ReplicaSSN!time02+ReplicaSSN.on+ReplicaSSN',
        '/LWWObject#time02+ReplicaSSN!time04+ReplicaSSN.key "new value"',
        ''
    ].join('\n'));

    let host = new Client('swarm+0://0eplica:1@02.B/test');
    const upstream = OpStream.QUEUES['02.B'];
    t.equals(upstream.ops.length, 1);
    t.equals(upstream.ops.shift().toString(), ops[0].toString());
    let synced = false;
    host.onSync( () => synced = true );
    t.notOk(synced);
    upstream._emit(ops[1]);
    t.notOk(synced);
    t.equals(host.time().toString(), 'time01+ReplicaSSN'); // cache init
    upstream._emit(ops[2]);
    t.ok(synced);

    // by-value constructor
    let props = host.newLWWObject({key: "value"});
    // write stamping
    t.equals(props.get('key'), 'value');
    let stamp = props.StampOf('key');
    t.equals(stamp.origin, 'ReplicaSSN');
    const state = upstream.ops.shift();
    t.equals(state.spec.method, Op.METHOD_STATE);
    t.equals(state.toString(), ops[3]+'');
    const on = upstream.ops.shift();
    t.equals(on.spec.method, Op.METHOD_ON);
    t.equals( on.spec.object, on.spec.object );
    t.equals(on.toString(), ops[4]+'');

    t.equals(props.StampOf('key').origin, 'ReplicaSSN');
    props.set('key', 'new value');
    t.equals(props.get('key'), 'new value');
    t.equals(props.StampOf('key').origin, 'ReplicaSSN');
    const op = upstream.ops.shift();
    t.equals(op.toString(), ops[5]+'');

    // by-id constructor, duplicate prevention
    let porps = host.fetch(props.spec);
    t.ok(porps===props);
    /*props.close();
    t.throws(function () { // the object is closed
        props.set('key', 'fails');
    });

    let props2 = host.fetch(props.spec);
    t.ok(props!==props2);
    t.ok(props2.get('key')===undefined); // NO STORAGE synchronous state load
    host.close();
    t.throws(function () { // the host and the object are closed
        props2.set('key', 'fails');
    });*/

    t.end();

});