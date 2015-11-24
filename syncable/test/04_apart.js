"use strict";
var sync = require('..');
var Spec = sync.Spec;
var Op = sync.Op;
var Model = sync.Model;
var Set = sync.Set;
var Host = sync.Host;

Host.multihost = true;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}

// A big advantage of the 1.0 model is that we can test everythign apart:
// CRDTs, API objects, Host, Replica, and so on...

tape ('syncable.04.A Model CRDT / Syncable', function (t) {

    t.plan(8);

    // CRDT
    var a = new Model.Inner();
    a.write(new Op('!stamp+src.set', '{"x": true}'));
    //t.equal(a.oplog['stamp+src'].x, true);
    t.equal(a.values.x.stamp, 'stamp+src', 'write is OK');
    t.equal(a.values.x.value, true);
    var b = new Model.Inner(a.toString());
    //t.equal(b.oplog['stamp+src'].x, true);
    t.equal(b.values.x.stamp, 'stamp+src', 'clone is OK');
    t.equal(b.values.x.value, true);

    // Syncable
    var m = new Model(null, null);
    b.updateSyncable(m);
    t.equal(m.x, true, 'Model got values');
    var keys = Object.keys(m);
    keys = keys.filter(function(k){
        return k.charAt(0)!=='_';
    });
    t.equal(keys.length, 1, '1 value field only');

    var submit = {name: null, value: null};
    var owner = {
        submit: function(obj, name, value) {
            submit = {name: name, value: value};
        }
    };
    m._owner = owner;

    m.set({y: false});
    t.equal(submit.name, 'set', 'makes new op');
    t.equal(submit.value, '{"y":false}');

});


tape ('syncable.04.B Set CRDT / Syncable', function (t) {

    // CRDT
    var a = new Set.Inner();
    a.write(new Op('!stamp0+src1.add', '#some+id'));
    t.equals(a.added['stamp0+src1'], '/Model#some+id', 'added');
    var b1 = new Set.Inner(a.toString());
    t.equals(b1.added['stamp0+src1'], '/Model#some+id', 'cloned');

    a.write(new Op('!stamp1+src2.rm', 'stamp0+src1'));
    t.equals(a.added['stamp0+src1'], undefined, 'erased');
    t.equals(a.added['stamp1+src2'], undefined);
    var b2 = new Set.Inner(a.toString());
    t.equals(b2.added['stamp0+src1'], undefined, 'clone - erased');

    a.write(new Op('!stamp2+src3.add', '#some+id'));

    // Syncable
    var submit = {name: null, value: null};
    var owner = {
        write: function(obj, name, value) {
            submit = {name: name, value: value};
        },
        get: function (spec) {
            return {
                spec: new Spec.Parsed(spec),
                on:function(ev, sub){
                    t.equal(ev, 'change', 'event name');
                    t.equal(sub, s.onObjectChange, 'subscriber');
                }
            };
        }
    };
    var s = new Set(null, null);
    s._owner = owner;
    a.updateSyncable(s);
    t.ok(s.contains('/Model#some+id'), 'contains'); // TODO abbrev
    s.forEach(function (obj, spec){
        t.equal(obj.spec.id(), 'some+id', 'forEach object iteration');
    });

    t.end();

});


tape.skip('syncable.04.C Concurrency in Set', function (t) {
    // TODO
});


tape ('syncable.04.D Model CRDT serialization', function (t) {
    var crdt = new Model.Inner();
    crdt.set({a:1, b:2}, 'stamp1+source');
    crdt.set({c:{d:4}}, 'stamp2+source');
    crdt.set({wrong:true}, 'неправильно');
    var copy = new Model.Inner(crdt.toString());
    t.equals(copy.values.a.value, 1);
    t.equals(copy.values.b.value, 2);
    t.equals(copy.values.c.value.d, 4);
    t.equals(copy.values.wrong, undefined, 'malformed record was ignored');
    t.equals(copy.values.a.stamp, 'stamp1+source');
    t.equals(copy.values.b.stamp, 'stamp1+source');
    t.equals(copy.values.c.stamp, 'stamp2+source');
    t.end();
});
