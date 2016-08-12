"use strict";
let tape = require('tap').test;
let swarm = require('swarm-protocol');
let Op = swarm.Op;
let LWWObject = require('../src/LWWObject');

tape ('syncable.03.A LWW object - getters', function (t) {

    let ops = Op.parseFrame(
        '/LWWObject#createdBy+author!longago+changed.~' + '\t' +
            '{"!longago+changed.field": "string",' +
             '"!createdBy+author.value": {"number":31415}}\n'
    );

    t.equals(ops.length, 1);

    let rdt = new LWWObject._rdt(ops[0]);

    t.equals(rdt.get("field"), "string");
    t.deepEqual(rdt.get("value"), {number:31415});

    t.end();

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
