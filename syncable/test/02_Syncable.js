"use strict";
var stamp = require('swarm-stamp');
var sync = require('..');
var Syncable = sync.Syncable;
var Host = sync.Host;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}


tape('2.A empty cycle', function (t) {
    var host = new Host({
        ssn_id: 'anon',
        db_id: 'db',
        clock: new stamp.LamportClock('anon')
    });
    var empty = new Syncable(null, host);
    t.equal(empty._version, empty._id, 'version id OK');
    t.ok(empty._id, 'id is assigned');
    var zero = host.getCRDT(empty);
    t.equal(zero._version, empty._id, 'default state version !0');
    t.equal(empty._version, empty._id, 'syncable rebuilt');
    host.close();
    t.end();
});

tape('2.B listeners', function (t) {
    var empty = new Syncable(null, null);
    empty.on('none', function(ev){
        t.equals(ev.name, "none", 'event is OK');
        t.end();
    });
    var event = {name: "none"};
    empty.emit('none', event);
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
