"use strict";
var stamp = require('swarm-stamp');
var sync = require('..');
var Model = sync.Model;
var Host = sync.Host;
var Spec = sync.Spec;
var Op = sync.Op;
var Set = sync.Set;

var tape = require('tap').test;


tape ('syncable.06.A Set basic API', function (t) {

    var host = new Host({
        ssn_id: 'syncable~05~A',
        db_id: 'db',
        clock: new stamp.LamportClock('syncable~05~A')
    });
    host.go();
    
    var a = new Model({name: 'Alice'}, host);
    var b = new Model({name: 'Bob'}, host);

    var set = new Set({}, host);
    t.ok(set.isEmpty(), 'isEmpty');

    set.add(a);
    t.ok(!set.isEmpty());
    t.ok(set.contains(a), 'contains()');
    t.ok(set.containsAll([a]), 'containsAll()');
    t.ok(set.containsId(a._id), 'use id');
    t.ok(set.containsAll([a, a]), 'containsAll()');
    t.throws(function(){
        set.contains(1);
    }, /not a syncable/i);

    set.addSpec(a.typeid());
    t.equal(set.toArray().length, 1);
    t.ok(set.contains(a), 'contains()');
    t.ok(set.containsAll([a]), 'containsAll()');

    set.addId(a._id);
    t.equal(set.toArray().length, 1);
    t.ok(set.containsId(a._id), 'use id');
    t.ok(set.containsAll([a, a]), 'containsAll()');

    set.removeId(a._id);
    t.equal(set.toArray().length, 0, 'array empty');
    t.equal(set.size(), 0, 'size 0');
    t.ok(set.isEmpty(), 'empty');
    t.notOk(set.containsId(a._id), '! contains()');
    t.notOk(set.containsAll([a]), '! containsAll()');

    set.add(a);
    set.addAll([b,a,b]);
    t.equal(set.size(), 2, 'size()');
    t.equal(set.toArray().length, 2);
    t.ok(set.containsAll([a, b]));

    var arr = set.toArray();
    t.equal(arr[0], a, 'order');
    t.equal(arr[1], b, 'order (2)');

    //var set2 = new Set([a,b], host); TODO
    //t.equal(set2.size(), 2, 'array constr => size()');

    t.end();

});


tape ('syncable.06.B Set CRDT / Syncable', function (t) {

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
                spec: new Spec(spec),
                on:function(ev, sub){
                    t.equal(ev, 'change', 'event name');
                    t.equal(sub, s.onObjectChange, 'subscriber');
                }
            };
        }
    };
    var s = new Set(null, null);
    s._owner = owner;
    a.updateSyncable(s, owner.get.bind(owner));
    t.ok(s.containsSpec('/Model#some+id'), 'contains'); // TODO abbrev
    s.forEach(function (obj, spec){
        t.equal(obj.spec.id(), 'some+id', 'forEach object iteration');
    });

    t.end();

});


// tape.skip('syncable.06.C Concurrency in Set', function (t) {
//     // TODO
// });
