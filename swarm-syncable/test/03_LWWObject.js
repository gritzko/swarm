"use strict";
let tap = require('tap').test;
let swarm = require('swarm-protocol');
let Op = swarm.Op;
let LWWObject = require('../src/LWWObject');

let simple_state_op_str =
    '/LWWObject#createdBy+author!longago+changed.~' + '\t' +
    '{"!longago+changed.field": "string",' +
    '"!createdBy+author.value": {"number":31415}}\n';
let simple_state_op = Op.parseFrame(simple_state_op_str)[0];

tap ('syncable.03.A LWW object RDT parse/serialize', function (t) {

    let rdt = new LWWObject._rdt(simple_state_op);

    t.equals(rdt.get("field"), "string");
    t.deepEqual(rdt.get("value"), {number:31415});

    let json = rdt.toString();
    t.deepEqual(JSON.parse(ops[0].value), JSON.parse(json));

    t.end();

});


tap ('syncable.03.B LWW object API', function (t) {

    let lww = new LWWObject(simple_state_op);

    t.ok( lww.get('field'), 'string' );
    // Object.defineProperty
    t.ok( lww.field, 'string' );

    let state = lww.toOp();

    t.ok(state.spec.eq(simple_state_op.spec));
    t.deepEqual(JSON.parse(state.value), JSON.parse(simple_state_op.value));

    // array indices   2 syncable
    let nothing = lww.at(4);
    t.equals(nothing, undefined);
    lww.setAt(4, 'value');
    t.equals(lww.at(4), 'value');
    lww.setAt(4, 0, '[4,0]');
    t.equals(lww.at(4,0), '[4,0]');
    t.equals(lww.at(4), 'value');

    concurrent;

    t.end();

});

tap ('syncable.03.C LWW object concurrent modification', function (t) {

    let ops = Op.parseFrame(

    );

});

// tap.skip ('syncable.02.D submit API', function (t) { FIXME revitalize
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
 tap ('syncable.02.a basic listener func', function (t) {
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
