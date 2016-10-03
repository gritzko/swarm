"use strict";
const tape = require('tape').test;
const swarm = require('swarm-protocol');
const Cache = require('../src/Cache');
const Client = require('../src/Client');
const Op = swarm.Op;
const OpStream = require('../src/OpStream');

tape ('syncable.09.A client cache - basic', function (t) {

    const ops = Op.parseFrame([
        "/Swarm#test!0.on+0eplica",
        '/Swarm#test!time01.~+ReplicaSSN=\n\t!1.Clock "Logical"\n\t!2.ClockLen 6',
        '/Swarm#test!time01.on+ReplicaSSN',
        '/LWWObject#id!time+origin.~ !2.cachedkey "cached_value"',
        '/LWWObject#id!time02+origin.new_key+ReplicaSSN "new_value"',
        ".on+ReplicaSSN",
        '/LWWObject#id!time03+ReplicaSSN.changedkey "changed_value"',
        ""
    ].join('\n'));
    const hs_op = ops[0];
    const meta_op = ops[1];
    const re_hs_op = ops[2];
    const cached_state_op = ops[3];
    const new_op = ops[4];
    const re_on_op = ops[5];
    const change_op = ops[6];

    const client = new Client('swarm+mem+0://0eplica@09.A/test');
    const cache = client._upstream;
    const up = OpStream.QUEUES['09.A'];

    cache.origin = 'ReplicaSSN'; // FIXME recognize hs

    let synced = false;
    client.onceReady( () => synced = true );

    // at this point, the cache has the outgoing handshake
    t.equal(synced, false);
    const hs = up.ops.shift();
    t.equals(hs.toString(), hs_op.toString());
    up._emit(meta_op);
    up._emit(re_hs_op);
    t.equal(synced, true);
    t.equal( client.time().origin, 'ReplicaSSN' );

    // inject a cache record
    const oid = new_op.spec.object;
    cache.__[oid] = cached_state_op.toString();

    // open an object
    let obj_stateful = false;
    let obj_synced = false;
    const obj = client.get( new_op.spec.type, new_op.spec.id, () => obj_stateful = true );
    t.ok(obj_stateful);
    t.ok(obj.hasState());
    t.equals(obj.get('cachedkey'), "cached_value");

    // check the subscription
    const on = up.ops.shift();
    t.equals(on.spec.object, oid);
    up._emit(new_op);
    // TODO onSync t.notOk(obj_synced);
    t.equals(obj.version, new_op.spec.stamp);
    t.equals(obj.get('new_key'), "new_value");
    up._emit(re_on_op);
    // TODO t.ok(obj_synced);

    // create new op, log, ack
    // obj.changed_key = "changed_value";
    // obj.save();
    obj.set('changedkey', "changed_value");
    const change = up.ops.shift();
    t.equals(change.toString(), change_op.toString());
    t.equals(cache.__log.length, 1);
    t.equals(cache.__log[0].toString(), change_op.toString());
    up._emit(change_op);
    t.equals(cache.__log.length, 0);
    const cached = cache.__[oid]; // FIXME back .on
    //t.equals(cached.spec.stamp, change.spec.stamp);
    //t.ok(cached.value.indexOf("changedkey")!==-1);

    // create object, check cache

    t.end();

});