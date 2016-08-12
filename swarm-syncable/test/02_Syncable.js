"use strict";
var tap = require('tap').test;

var swarm = require('swarm-protocol');
var Spec = swarm.Spec;
var Op = swarm.Op;
var Syncable = require('../src/Syncable');
var Stamp = swarm.Stamp;


tap ('syncable.02.A empty cycle', function (t) {
    /*var host = new Host({
        ssn_id: 'anon',
        db_id: 'db',
        clock: new stamp.LamportClock('anon')
    });
    host.go();*/
    var ops = Op.parseFrame(
        '/Syncable#time+author!time+author.~\n' +
        '/Syncable#time+author!update+author.0\n'
    );
    t.equals(ops.length, 2);

    var empty = new Syncable(ops[0]);
    
    t.equal(empty.version, 'time+author', 'version id OK');
    t.equal(empty.id, 'time+author', 'id OK');
    t.equal(empty.author, 'author');
    t.equal(empty.typeid, '/Syncable#time+author');
    t.ok(empty.hasState());

    let check = 0;
    empty.onOp('0', ()=>check++ );

    empty.offer(ops[1]);

    t.equal(empty.version, 'update+author', 'version id OK');
    t.ok(empty.Version.eq( new Stamp('update+author') ));
    t.equal(empty.id, 'time+author', 'id OK');
    t.equal(empty.author, 'author');
    t.equal(empty.typeid, '/Syncable#time+author');
    t.equal(check, 1);

    t.end();
});

//--8<--------------------------
/*
tap('syncable.02.C batch events', function (t) {
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


tap('syncable.02.D Host.get / Swarm.get', function (t) {
    var host = new Host({
        ssn_id: 'anon~02~D',
        db_id:  'db',
        clock:  stamp.LamportClock
    });
    host.go();

    var empty_model = host.get();
    t.equal(empty_model.constructor, Model);
    t.equal(empty_model._version, empty_model._id);

    var model_2 = host.get('/Model');
    t.equal(model_2.constructor, Model);
    t.equal(model_2._version, model_2._id);

    t.throws(function(){
        model_2.set({
            "Model": false,
            _id: null
        });
    });
    model_2.set({
        "prototype": 42,
        "toString": null,
    });
    t.ok(model_2.Model!==false);
    t.ok(model_2.prototype!==42);
    t.ok(typeof model_2.toString === 'function');
    t.ok(model_2._id.constructor===String);
    t.ok(new Lamp(model_2._version).time() > new Lamp(model_2._id).time());

    var model_2B = host.get(model_2._id);
    t.ok(model_2===model_2B);

    var model_2C = host.get(model_2.typeid());
    t.ok(model_2===model_2C);

    var model_2D = host.get(model_2.typeId());
    t.ok(model_2===model_2D);

    t.throws(function(){
        host.get('/Not-a-spec@#$%$%');
    });

    host.end();
    t.end();
});

*/