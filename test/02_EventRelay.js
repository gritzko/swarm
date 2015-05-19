"use strict";

var env = require('../lib/env');
var Spec = require('../lib/Spec');
var Host = require('../lib/Host');
var Model = require('../lib/Model');
var SyncSet = require('../lib/Set');
var Storage = require('../lib/Storage');
var levelup = require('levelup');
var memdown = require('memdown');

env.multihost = true;
env.debug = console.log;
env.logs.op = true;

MetricLengthField.metricRe = /(\d+)(mm|cm|m|km)?/g;  // "1m and 10cm"
MetricLengthField.scale = { m:1, cm:0.01, mm:0.001, km:1000 };
MetricLengthField.scaleArray = ['km','m','cm','mm'];

function MetricLengthField (value) {
    // convert mm cm m km
    if (typeof(value)==='number') {
        this.meters = value;
    } else {
        value = value.toString();
        this.meters=0;
        var m=[], scale=MetricLengthField.scale;
        MetricLengthField.metricRe.lastIndex = 0;
        while (m=MetricLengthField.metricRe.exec(value)) {
            var unit = m[2] ? scale[m[2]] : 1;
            this.meters += parseInt(m[1]) * unit;
        }
    }
}
MetricLengthField.prototype.add = function () {

};
// .pojo() invokes (entry.toJSON&&entry.toJSON()) || entry.toString()
MetricLengthField.prototype.toString = function () {
    var m = this.meters, ret='', scar = MetricLengthField.scaleArray;
    for(var i=0; i<scar.length; i++) {
        var unit = scar[i],
            scale= MetricLengthField.scale[unit];
        var wholeUnits = Math.floor(m/scale);
        if (wholeUnits>=1) {
            ret += wholeUnits + unit;
        }
        m -= wholeUnits*scale;
    }
    return ret;
};
MetricLengthField.prototype.toPojo = MetricLengthField.prototype.toString;


// Duck is our core testing class :)
var Duck = Model.extend('Duck',{
    defaults: {
        age: 0,
        height: {type:MetricLengthField,value:'3cm'},
        mood: 'neutral'
    },
    // Simply a regular convenience method
    canDrink: function () {
        return this.age >= 18; // Russia
    },
    validate: function (spec,val) {
        return ''; // :|
        //return spec.op()!=='set' || !('height' in val);
        //throw new Error("can't set height, may only grow");
    }
    /*$$grow: function (spec,by,src) {
        this.height = this.height.add(by);
    }*/
});

var Nest = SyncSet.extend('Nest',{
    entryType: Duck
});

var db2 = levelup('222', { db: memdown });
var storage2 = new Storage(db2);
var host2 = env.localhost= new Host('gritzko',0,storage2);
host2.availableUplinks = function () {return [storage2]; };

/*test('2._ empty Syncable', function () {
    ok(true); // TODO
    // var syn = new Syncable(host2);
    // equal(syn._version,'!0')
    // deepEqual(syn.toPojo(),{});
    // deepEqual(syn.toPojo(true),{
    //    _version,'!0', _id: syn._id, _host: host2
    //});
});*/


asyncTest('2.a basic listener func', function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    env.logs.op = true;
    expect(7);
    // global objects must be pre-created
    host2.deliver(new Spec('/Duck#hueyA!0time.state'), '{}');
    // construct an object with an id provided; it will try to fetch
    // previously saved state for the id (which is none)
    var huey = host2.get('/Duck#hueyA');
    //ok(!huey._version); //storage is a?sync
    // listen to a field
    huey.on4('set:age',function lsfn2a (ev){
        equal(ev.value.age,1); // 1
        equal(ev.spec.op(),'set'); // 2
        equal(ev.spec.toString(),'/Duck#hueyA!'+ev.spec.version()+'.set'); // 3
        var version = ev.spec.token('!');
        equal(version.ext,'gritzko'); // 4
        huey.off4('set:age',lsfn2a);
        //equal(huey._lstn.length,2); // only the uplink remains (and the comma)
    });
    huey.on4('set', function (ev) {
        deepEqual(ev.value, {age: 1}); // 5
        deepEqual(ev.old_value, {age: 0}); // 6
    });
    huey.on4('set:age', function (ev) {
        equal(ev.value.age, 1); // 7
        env.logs.op = false;
        start();
    });
    huey.on4('set:height', function (ev) {
        ok(false);
    });
    huey.onInit4(function init2a () {
        huey.set({age:1});
    });
});

test('2.b create-by-id', function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    // there is 1:1 spec-to-object correspondence;
    // an attempt of creating a second copy of a model object
    // will throw an exception
    var dewey1 = new Duck('dewey');
    // that's we resort to descendant() doing find-or-create
    var dewey2 = host2.get('/Duck#dewey');
    // must be the same object
    strictEqual(dewey1,dewey2);
    equal(dewey1.spec().type(),'Duck');
});


asyncTest('2.c version ids', function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    host2.deliver(new Spec('/Duck#louie!0time.state'), '{}');
    var louie = new Duck('louie');
    louie.onInit4(function(){
        var ts1 = host2.time();
        louie.set({age:3});
        var ts2 = host2.time();
        ok(ts2>ts1);
        var vv = new Spec.Map(louie._version);
        ok(vv.covers(ts1));
        ok(!vv.covers(ts2));
        console.log(ts1,vv.toString(),ts2);
        start();
    });
});

test('2.d pojos',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var dewey = new Duck({age:0});
    var json = dewey.toPojo();
    var duckJSON = {
        mood: "neutral",
        age: 0,
        height: '3cm'
    };
    deepEqual(json,duckJSON);
});

asyncTest('2.e reactions',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var huey = new Duck();
    expect(2);
    var handle = Duck.addReaction('set', function reactionFn(spec,val) {
        console.log('yupee im growing');
        equal(val,'{"age":1}');
        start();
    });
    //var version = host2.time(), sp = '!'+version+'.set';
    huey.deliver(huey.newEventSpec('set'), '{"age":1}');
    Duck.removeReaction(handle);
    equal(Duck.prototype._reactions['set'].length,0); // no house cleaning :)
});

// TODO $$event listener/reaction (Model.on: 'key' > .set && key check)

test('2.f once',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var huey = new Duck();
    expect(1);
    huey.once4('set:age',function onceAgeCb(ev){
        equal(ev.value.age,4);
    });
    huey.set({age:4});
    huey.set({age:5});
});

asyncTest('2.g custom field type',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    host2.deliver(new Spec('/Duck#huey!0time.state'), '{}');
    var huey = host2.get('/Duck#huey');
    huey.onInit4(function(){ // FIXME onLoad
        huey.set({height:'32cm'});
        ok(Math.abs(huey.height.meters-0.32)<0.0001);
        var vid = host2.time();
        host2.deliver(new Spec('/Duck#huey!'+vid+'.set'),'{"height":"35cm"}');
        huey.on4('set', function(){
            ok(Math.abs(huey.height.meters-0.35)<0.0001);
            start();
        });
    });
});

test('2.h state init',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var factoryBorn = new Duck({age:0,height:'4cm'});
    ok(Math.abs(factoryBorn.height.meters-0.04)<0.0001);
    equal(factoryBorn.age,0);
});

test('2.i batched set',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var nameless = new Duck();
    nameless.set({
        age:1,
        height: '60cm'
    });
    ok(Math.abs(nameless.height.meters-0.6)<0.0001);
    equal(nameless.age,1);
    ok(!nameless.canDrink());

});

/* FIXME:  spec - to - (order)
test('2.j basic Set functions (string index)',function (test) {
    console.warn(QUnit.config.current.testName);
    env.localhost= host2;
    var hueyClone = new Duck({age:2});
    var deweyClone = new Duck({age:1});
    var louieClone = new Duck({age:3});
    var clones = new Nest();
    clones.addObject(louieClone);
    clones.addObject(hueyClone);
    clones.addObject(deweyClone);
    var sibs = clones.list(function(a,b){return a.age - b.age;});
    strictEqual(sibs[0],deweyClone);
    strictEqual(sibs[1],hueyClone);
    strictEqual(sibs[2],louieClone);
    var change = {};
    change[hueyClone.spec()] = 0;
    clones.change(change);
    var sibs2 = clones.list(function(a,b){return a.age - b.age;});
    equal(sibs2.length,2);
    strictEqual(sibs2[0],deweyClone);
    strictEqual(sibs2[1],louieClone);
});*/

test('2.l partial order', function (test) {
    env.localhost= host2;
    var duckling = new Duck();
    duckling.deliver(new Spec(duckling.spec()+'!1time+user2.set'),'{"height":"2cm"}');
    duckling.deliver(new Spec(duckling.spec()+'!0time+user1.set'),'{"height":"3cm"}');
    equal(duckling.height.toString(), '2cm');
});

/*asyncTest('2.m init push', function (test) {
    env.localhost= host2;
    var scrooge = new Duck({age:105});
    scrooge.onInit4(function check() {
        equal(scrooge._version.substr(1), scrooge._id);
        var json = storage2.states[scrooge.spec()];
        ok(json);
        var state = JSON.parse(json);
        equal(state.age,105);
        start();
    });
});*/

/*test('2.n local listeners for on/off', function () {
    console.warn(QUnit.config.current.testName);
    expect(4);
    env.localhost= host2;
    var duck = new Duck();
    duck.on('.on', function (spec, val) {
        console.log('triggered by itself, on(init) and host2.on below');
        equal(spec.op(), 'on');
    });
    duck.onInit4(function gotit(){
        console.log('inevitable');
        ok(duck._version);
    });
    duck.on('.reon', function (spec, val) {
        console.log("must NOT get triggered if the storage is sync");
        equal(spec.op(), 'reon');
    });
    host2.on('/Host#gritzko.on', function (spec, val) {
        console.log('this listener is triggered by itself');
        equal(spec.op(), 'on');
    });
});*/


/*test('2.o event relay', function () {
    console.warn(QUnit.config.current.testName);
    var hueyClone = new Duck({age:2}, host2);
    var deweyClone = new Duck({age:1}, host2);
    var louieClone = new Duck({age:3}, host2);
    var clones = new Nest('',host2);
    clones.addObject(louieClone);
    clones.addObject(hueyClone);
    clones.onObjectEvent(function(spec,val){
        ok('age' in val);
    });
    expect(3);
    hueyClone.set({age:3});
    louieClone.set({age:4});
    clones.addObject(deweyClone);
    deweyClone.set({age:2});
});*/




/*  TODO
 * test('2.m on/off sub', function (test) {
    env.localhost= host2
    var duckling = new Duck();

    expect(2);
    duckling.on('on',function(spec){
        ok(spec.op(),'on');
    });
    duckling.on('set',function(spec){
        equal(spec.op(),'set');
    });
    duckling.set({age:1});

});*/
