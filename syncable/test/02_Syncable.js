"use strict";
var sync = require('..');
var Spec = sync.Spec;
var Op = sync.Op;
var Syncable = sync.Syncable;
var Host = sync.Host;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}


tape('2.A empty cycle', function (t) {
    var host = new Host('anon', null);
    var empty = new Syncable('sample', host);
    t.equal(empty._version, '', 'stateless, version id empty');
    t.ok(empty._id, 'sample', 'id is valid');
    var new_syncable_event = new Spec('/Syncable#sample!0.state');
    var zero = new Syncable.Inner(new Op(new_syncable_event, ''));
    t.equal(zero._version, '!0', 'default state version !0');
    empty.rebuild(zero);
    t.equal(empty._version, '!0', 'syncable rebuilt');
    t.ok(empty._id, 'sample', 'id is still valid');
    host.close();
    t.end();
});

tape('2.B listeners', function (t) {
    t.plan(2);
    var host = new Host('anon', null);
    var empty = new Syncable('emitter', host);
    empty.on(function(ev){
        t.equals(ev.name, "none");
        t.equals(ev.target, empty);
        host.close();
        t.end();
    });
    var event = {name: "none"};
    empty.emit(event);
});

tape.skip('2.C batch events', function (t) {
    var host = new Host('anon', null);
    var empty = new Syncable('emitter', host);
    var c = 0;
    empty.on(function(ev){
        t.equals(ev.id, ++c);
        host.close();
        t.end();
    });
    empty.emit([
        {target:null, name:'empty', id:1},
        {target:null, name:'empty', id:2}
    ]);
});

/*
tape('2.a basic listener func', function (t) {
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
