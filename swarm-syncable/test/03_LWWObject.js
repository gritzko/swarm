"use strict";
let tap = require('tap').test;
let swarm = require('swarm-protocol');
let Op = swarm.Op;
let LWWObject = require('../src/LWWObject');
let Clock = swarm.Clock; //require('../src/Clock');


tap ('syncable.03.A LWW object API', function (t) {

    let clock = new Clock('test', {ClockMode: 'Logical'});

    let lww = new LWWObject();
    lww._clock = clock;

    // get-set field access
    t.equal( lww.get('field'), undefined );
    t.equal( lww.set('field', 'string'), undefined );
    t.equal( lww.get('field'), 'string' );
    t.ok( lww.field===undefined ); // no direct field access

    let ops = lww.spill();
    t.equals(ops.length, 1);
    t.equals(ops[0].value, '"string"');
    t.equals(ops[0].spec.name, 'field');

    t.end();

});

let simple_state_op_str =
    '/LWWObject#createdBy+author!longago+changed.~=\n' +
    '\t!longago+changed.field\tstring\n' +
    '\t!createdBy+author.value\t{"number":31415}\n\n';
let simple_state_op = Op.parseFrame(simple_state_op_str)[0];

tap ('syncable.03.B LWW object RDT parse/serialize', function (t) {

    let rdt = new LWWObject.RDT(simple_state_op.value);

    t.equals(rdt.get("field"), "string");
    t.deepEqual(rdt.get("value"), '{"number":31415}');

    let state = rdt.toString();
    t.deepEqual(state, simple_state_op.value);

    t.end();

});


tap ('syncable.03.C LWW object concurrent modification', function (t) {

    let rdt = new LWWObject.RDT(simple_state_op.value);

    const concurrent_op = Op.parseFrame(
        '/LWWObject#createdBy+author!longago+c0ncurrent.field\twrong\n\n'
    )[0];

    rdt.apply(concurrent_op);

    t.equals(rdt.get('field'), 'string');

    const non_concurrent_op = Op.parseFrame(
        '/LWWObject#createdBy+author!longago+concurrent.field\tright\n\n'
    )[0];

    rdt.apply(non_concurrent_op);

    t.equals(rdt.get('field'), 'right');

    t.end();

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
