/**
 * Created with JetBrains WebStorm.
 * User: gritzko
 * Date: 8/24/13
 * Time: 6:21 PM
 */

if (typeof require == 'function') {
    var swrm = require('../lib/swarm3.js');
    Spec = swrm.Spec;
    Swarm = swrm.Swarm;
    Model = swrm.Model;
    Field = swrm.Field;
    Set = swrm.Set;
} else {
    exports = this.testEventRelay = {};
}

// BACK TO SANITY
// V 0 write a test for tracked props/logged methods/serial/etc : the API end
// V 1 nice stacks, extend only, constructors, no surrogates
// X 2 introspection back NO use addXXX() instead
// V 3 trace it all along; get an intuition
// V 4 init(): parent.children[id] = this;   (no create();
//     new>init>children call chain instead)
//
// USABILITY TODOs
//   1 new Model(id) OR new Model(values)
//
// CASCADE OPEN QUESTIONS
// V 1 which swarm an obj belongs to? (finding the parent)
//      new Swarm() becomes THE swarm, invoking .close() for the previous
//      testing swarms: they are asynchronously connected, right? :)
// V 2 should we put Views into the cascade or not?
//      NO, the cascade is for models (sets, stubs)
//      YES, if we want to cache/store Views
//      YES, for uniformity, as Views are EventRelays
//      YES, if we want to subscribe to Views (bare clients have no models)
//
// STORAGE/TRANSPORT OPEN QUESTIONS
// V 1 should we add store/relay() method to model/views or use root.relay() ?
//    x ROOT   as the server knows storage and uplink, downlinks are in _lstn
//    v METHOD as we want to overload it for classes (what do we need the
//             cascade for?)
//             then, load() is part of init()?
//    x ROOT   when using this.store() we need access to the root anyway
//    v METHOD Model.store = function () { sql.update() }
//    v METHOD listeners in model: better encapsulation
// V 2 there is nothing bad in caching everything you get
// V 3 stubs only have _lstn[], right?
//
// IMPLEMENTATION/TESTING PIPELINE
// V 1 field set
//      huey.age(1);
// V 1' parent tree
//     x a duck.parent===duckType
//     v b root.descendant('/Duck#huey')
// V 2 batch field set
//      huey.set({age:1,height:"30cm"})
//      // including replica bootup
// V 3 init(id) vs init(value)
//    v frozen vid
// V 4 three-position signature
//      Spec.normalize(arguments);
//      var spec=arguments[0], value=arguments[1], listener=arguments[2];
// V 5 fieldTypes - ???
// ? 6 Set
//      a string-to-spec key
// > 7 View (default templated)  see 3_view.js
//   8 RPC calls
//   9 Rework EventRelayNode.set (see notes)
//   A EventRelay.get (action *get, async)
// X B specifier as a label stack (_parent, spec.push/pop/unshift/shift)
//    v a this._parent

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
};
MetricLengthField.prototype.add = function () {
    
};
// .pojo() invokes (entry.toJSON&&entry.toJSON()) || entry.toString()
MetricLengthField.prototype.toString = function () {
    var m = this.meters, ret='', scar = MetricLengthField.scaleArray;
    for(var i=0; i<scar.length; i++) {
        var unit = scar[i],
            scale= MetricLengthField.scale[unit];
        var wholeUnits = Math.floor(m/scale);
        if (wholeUnits>=1)
            ret += wholeUnits+unit;
        m -= wholeUnits*scale;
    }
    return ret;
};


// Duck is our core testing class :)
var Duck = Swarm.Model.extend('Duck',{
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
        return true; // :|
        //return spec.method()!=='set' || !('height' in val);
        //throw new Error("can't set height, may only grow");
    },
    $$grow: function (spec,by,src) {
        this.height = this.height.add(by);
    }
});

var Nest = Swarm.Set.extend('Nest',{
    entryType: Duck
});

var storage = new DummyStorage(false);
var host = Swarm.localhost = new Swarm.Host('gritzko',0,storage);
host.availableUplinks = function () {return [storage]};

test('2.a basic listener func', function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    expect(6);
    // construct an object with an id provided; it will try to fetch
    // previously saved state for the id (which is none)
    var huey = host.get('/Duck#hueyA');
    ok(huey._version); // storage is sync, must return empty init + storage timestamp
    // listen to a field
    huey.on('age',function lsfn(spec,val){  // FIXME: filtered .set listener!!!
        equal(val.age,1);
        equal(spec.method(),'set');
        equal(spec.toString(),'/Duck#hueyA!'+spec.version()+'.set');
        var version = spec.token('!');
        equal(version.ext,'gritzko');
        huey.off('age',lsfn);
        equal(huey._lstn.length,2); // only the uplink remains (and the comma)
    });
    huey.set({age:1});
});

test('2.b create-by-id', function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    // there is 1:1 spec-to-object correspondence;
    // an attempt of creating a second copy of a model object
    // will throw an exception
    var dewey1 = new Duck('dewey');
    // that's we resort to descendant() doing find-or-create
    var dewey2 = host.get('/Duck#dewey');
    // must be the same object
    strictEqual(dewey1,dewey2);
    equal(dewey1.spec().type(),'Duck');
});


test('2.c version ids', function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    var louie = new Duck('louie');
    var ts1 = host.version();
    louie.set({age:3});
    var ts2 = host.version();
    ok(ts2>ts1);
    var vid = louie._version;
    ok(ts1<vid);
    ok(ts2>vid);
    console.log(ts1,vid,ts2);
});

test('2.d pojos',function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    var dewey = new Duck({age:0});
    var json = dewey.pojo();
    var duckJSON = {
        mood: "neutral", 
        age: 0,
        height: '3cm'
    };
    deepEqual(json,duckJSON);
});

asyncTest('2.e reactions',function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    var huey = host.get('/Duck#huey');
    expect(2);
    var handle = Duck.addReaction('age', function reactionFn(spec,val) {
        console.log('yupee im growing');
        equal(val.age,1);
        start();
    });
    var version = host.version(), sp = '!'+version+'.set', batch = {};
    batch[sp] = {age:1};
    huey.deliver(huey.newEventSpec('bundle'), batch); // ~ set{}
    Duck.removeReaction(handle);
    equal(Duck.prototype._reactions['set'].length,0); // no house cleaning :)
});

// TODO $$event listener/reaction (Model.on: 'key' > .set && key check)

test('2.f once',function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    var huey = host.get('/Duck#huey');
    expect(1);
    huey.once('age',function onceAgeCb(spec,value){
        equal(value.age,4);
    });
    huey.set({age:4});
    huey.set({age:5});
});

test('2.g custom field type',function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    var huey = host.get('/Duck#huey');
    huey.set({height:'32cm'});
    ok(Math.abs(huey.height.meters-0.32)<0.0001);
    var vid = host.version();
    host.deliver(new Swarm.Spec('/Duck#huey!'+vid+'.set'),{height:'35cm'});
    ok(Math.abs(huey.height.meters-0.35)<0.0001);
});

test('2.h state init',function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    var factoryBorn = new Duck({age:0,height:'4cm'});
    ok(Math.abs(factoryBorn.height.meters-0.04)<0.0001);
    equal(factoryBorn.age,0);
});

test('2.i batched set',function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    var nameless = new Duck();
    nameless.set({
        age:1,
        height: '60cm'
    });
    ok(Math.abs(nameless.height.meters-0.6)<0.0001);
    equal(nameless.age,1);
    ok(!nameless.canDrink());
    
});

// FIXME:  spec - to - (order)
test('2.j basic Set functions (string index)',function (test) {
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    var hueyClone = new Duck({age:2});
    var deweyClone = new Duck({age:1});
    var louieClone = new Duck({age:3});
    var donalds = new Nest({'#third':deweyClone.spec(),'#second':hueyClone.spec()}); // TODO dafault type
    var dewey2 = donalds.get('#third');
    ok(deweyClone===dewey2);
    equal(dewey2.age,1);
    donalds.add('#first',louieClone.spec());
    var l2 = donalds.get('#first');
    equal(l2.age,3);
    var realLouie = host.get('/Duck#louie'); // item type is fixed so not /Duck#louie but louie TODO
    donalds.add('#louie',realLouie);
    equal(realLouie._id,'louie');
    donalds.remove('#louie');
    var collection = donalds.collection();
    equal(collection.length,3);
    equal(collection[0]._id, louieClone._id);
    equal(''+collection[1], ''+hueyClone.spec()); // no fill()
    equal(collection[2]._id, deweyClone._id);
    donalds.fillAll();
    var collection = donalds.collection();
    equal(collection[1]._id, hueyClone._id);
});

test('2.k distilled log', function (test) {
    function logSize(obj) {
        var log = obj._oplog, cnt=0;
        for(var key in log) cnt++;
        return cnt;
    }
    console.warn(QUnit.config.current.testName);
    Swarm.localhost = host;
    var duckling1 = host.get(Duck);
    duckling1.set({age:1});
    duckling1.set({age:2});
    duckling1.distillLog();
    equal(logSize(duckling1),1);
    duckling1.set({height:'30cm',age:3});
    duckling1.set({height:'40cm',age:4});
    duckling1.distillLog();
    equal(logSize(duckling1),1);
    duckling1.set({age:5});
    duckling1.distillLog();
    equal(logSize(duckling1),2);
});

test('2.l partial order', function (test) {
    Swarm.localhost = host;
    var duckling = new Duck();
    duckling.deliver(new Swarm.Spec(duckling.spec()+'!time+user2.set'),{height:'2cm'});
    duckling.deliver(new Swarm.Spec(duckling.spec()+'!time+user1.set'),{height:'1cm'});
    equal(duckling.height.toString(), '2cm');
});

/*  TODO
 * test('2.m on/off sub', function (test) {
    Swarm.localhost = host;
    var duckling = new Duck();

    expect(2);
    duckling.on('on',function(spec){
        ok(spec.method(),'on');
    });
    duckling.on('set',function(spec){
        equal(spec.method(),'set');
    });
    duckling.set({age:1});

});*/
