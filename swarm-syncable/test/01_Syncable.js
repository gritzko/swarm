"use strict";
var tap = require('tape').test;

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
    var ops = Op.parseFrame([
        '/Syncable#time+author!0.~\n',
        '/Syncable#time+author!time+author.~\n',
        '/Syncable#time+author!update+author.0\n',
        '/Syncable#time+author!time+author.on+replica\n'
    ].join('\n'));
    t.equals(ops.length, 4);

    const zero = ops[0];
    const state = ops[1];
    const noop = ops[2];
    const reon = ops[3];

    let rdt = new Syncable.RDT(zero, null);
    var empty = new Syncable(rdt);

    t.equal(empty.version, '0', 'version comes from an op');
    t.equal(empty.id, 'time+author', 'id comes from an op');

    rdt._apply(state);
    
    t.equal(empty.version, 'time+author', 'version id OK');
    t.equal(empty.id, 'time+author', 'id OK');
    t.equal(empty.author, 'author');
    t.equal(empty.typeid, '/Syncable#time+author');
    t.ok(empty.hasState());

    rdt._apply(noop);

    t.equal(empty.version, 'update+author', 'version id OK');
    t.ok(empty.Version.eq( new Stamp('update+author') ));
    t.equal(empty.id, 'time+author', 'id OK');
    t.equal(empty.author, 'author');
    t.equal(empty.typeid, '/Syncable#time+author');

    rdt._apply(reon);
    t.equal(empty.version, 'update+author', 'version id OK');

    t.end();
});

//--8<--------------------------
/*

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
