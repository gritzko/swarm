"use strict";
var stamp = require('swarm-stamp');
var sync = require('..');
var Syncable = sync.Syncable;
var Host = sync.Host;
var Model = sync.Model;
var Spec = sync.Spec;
var Op = sync.Op;
var tape = require('tap').test;


Host.multihost = true;


tape ('syncable.02.A empty cycle', function (t) {
    var host = new Host({
        ssn_id: 'anon',
        db_id: 'db',
        clock: new stamp.LamportClock('anon')
    });
    host.go();
    var empty = new Syncable(null, host);
    t.equal(empty._version, empty._id, 'version id OK');
    t.ok(empty._id, 'id is assigned');

    var typeId = empty.typeId();
    t.equal(typeId.type(), 'Syncable', 'typeId()');
    t.equal(typeId.id(), empty._version, 'typeId()');
    var typeid = empty.typeid();
    t.equal(typeid, '/Syncable#'+empty._id, 'typeid()');

    var zero = host.getCRDT(empty);
    t.equal(zero._version, empty._id, 'default state version !0');
    t.equal(empty._version, empty._id, 'syncable rebuilt');
    host.close();
    t.end();
});

tape ('syncable.02.B listeners', function (t) {
    var empty = new Syncable(null, null);
    empty.on('none', function(ev){
        t.equals(ev.name, "none", 'event is OK');
        t.end();
    });
    var event = {name: "none"};
    empty.emit('none', event);
});


tape('syncable.02.C batch events', function (t) {
    var host = new Host({
        ssn_id: 'anon~02~C',
        db_id:  'db',
        clock: stamp.LamportClock
    });
    host.go();
    var empty = new Model({}, host);

    var spec = new Spec(empty.typeid()+'.set');
    var op1 = new Op(spec.add(host.clock.issueTimestamp(), '!'), '{"a":1}');
    var op2 = new Op(spec.add(host.clock.issueTimestamp(), '!'), '{"b":2}');
    var op3 = new Op(spec.add(host.clock.issueTimestamp(), '!'), '{"c":3}');

    var count = 0;

    empty.on('change', function () {
        count++;
    });

    host.write(new Op(empty.typeid()+'.on', '', null, [op1, op2, op3]));

    setTimeout(function(){
        t.equal(count, 1, 'change event bundling');
        t.equal(empty.a, 1, 'a');
        t.equal(empty.b, 2, 'b');
        t.equal(empty.c, 3, 'c');
        t.equal(empty._version, op3.stamp());
        t.end();
    }, 1);

});


// tape.skip ('syncable.02.D submit API', function (t) { FIXME revitalize
//     var host = new Host({
//         ssn_id: 'anon~02~D',
//         db_id: 'db',
//         clock: stamp.LamportClock
//     });
//     var last_op;
//     host.on('data', function (op) {
//         last_op = op;
//     });
//
//     var obj = new Model({c:1}, host);
//     obj.a = 2;
//     obj.save();
//     t.equal(obj.a, 2, 'save()');
//     t.equal(obj.c, 1, 'old field is intact');
//     t.equal(last_op.name(), 'set', 'op is .set');
//     t.equal(last_op.value, '{"a":2}', 'op value');
//
//     obj.submit('set', '{"a":3}');
//     t.equal(obj.a, 3, 'name-value syntax');
//
//     host.submitOp(new Op(obj.typeid().add('.set'), '{"b":4}'));
//     t.equal(obj.a, 3, 'submitOp - merge');
//     t.equal(obj.b, 4, 'submitOp - new value');
//     t.equal(obj.c, 1, 'old field is intact');
//
//     host.close();
//     t.end();
// });

/*
tape ('syncable.02.a basic listener func', function (t) {
    t.plan(6); // ...7
    var huey = new Model({}, null);
    var huey_ti = huey.spec();
    huey.onFieldChange('age',function lsfn2a (ev){
        t.equal(ev.value.age,1); // 1
        t.equal(ev.spec.op(),'set'); // 2
        t.equal(ev.spec.toString(),
            huey_ti+'!'+ev.spec.version()+'.set'); // 3
        var version = ev.spec.token('!');
        t.equal(version.ext,'gritzko'); // 4
        huey.off('set:age',lsfn2a);
        //equal(huey._lstn.length,2); // only the uplink remains (and the comma)
    });
    huey.on('set', function (ev) {
        t.deepEqual(ev.value, {age: 1}); // 5
        //deepEqual(ev.old_value, {age: 0}); // 6
    });
    huey.onFieldChange('age', function (ev) {
        t.equal(ev.value.age, 1); // 7
        t.end();
    });
    huey.onFieldChange('height', function (ev) {
        t.ok(false);
    });
    huey.onInit(function init2a () {
        huey.set({age:1});
    });
});
*/
