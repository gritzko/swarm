/**
 * Created with JetBrains WebStorm.
 * User: gritzko
 * Date: 8/24/13
 * Time: 6:21 PM
 */

if (typeof require == 'function') {
    var swrm = require('../lib/swarm2.js');
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
// V 2 there is nothing bad in caching everything you get
// V 3 stubs only have _lstn[], right?
//
// IMPLEMENTATION/TESTING PIPELINE
// V 1 field set
//      huey.age(1);
// V 1' parent tree
//     x a duck.parent===duckType
//     v b root.obtain('/Duck#huey')
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

function NumberField (id) {
    this.init(id);
}
Field.extend(NumberField,{
    validate: function (spec,val) {
        return typeof(val)==='number';
    }
});

function MetricLengthField (id) {
    this.init(id);
}
Field.extend(MetricLengthField,{
    metricRe: /(\d+)(mm|cm|m|km)?/g,
    scale: { m:1, cm:0.01, mm:0.001, km:1000 },
    set: function (spec,value) {
        // convert mm cm m km
        if (typeof(value)==='number') {
            this.value = value;
        } else {
            value = value.toString();
            var m=[], meters=0;
            while (m=this.metricRe.exec(value)) {
                var unit = m[2] ? this.scale[m[2]] : 1;
                meters += parseInt(m[1]) * unit;
            }
            this.value = meters;
        }
        this.version = spec.version;
    },
    validate: function (spec,val) {
        return typeof(val)==='number' || 
            !val.toString().replace(this.metricRe,'');
    },
    toString: function () {
    }
});

// Duck is our core testing class :)
function Duck (id,vals) {
    this.init(id,vals);
    // mood is mutated by a logged method
    this.mood = this.mood||'neutral'; // TODO nicer
};

// Simply a regular convenience method
Duck.prototype.canDrink = function () {
    return this.age() >= 18;
};


Model.extend(Duck);
Swarm.addType(Duck);  // Model by default 

Duck.addProperty('age',0,NumberField);
Duck.addProperty('height','5cm',MetricLengthField);
Duck.addMethod(function grow(cm){});
Duck.addCall(function reportAge(){});
Duck.addCall('reportAge');

/*function Nest (id,vals) {
    this.init(id,vals);
}*/

var Nest = Set.extend('Nest');//Nest);
Swarm.addType(Nest);
Nest.setEntryType(Duck);


if (Swarm.root)
    Swarm.root.close();

var root = new Swarm('gritzko');


test('basic listener func', function (test) {
    expect(4);
    // construct an object with an id provided; it will try to fetch
    // previously saved state for the id (which is none)
    var huey = Swarm.root.obtain('/Duck#huey');
    // listen to a field
    huey.on('age',function lsfn(spec,val){
        equal(val,1);
        // spec is a compund identifier;
        // field name is mentioned as 'member'
        equal(spec.member,'age');
        equal(spec.toString(),'/Duck#huey.age!'+spec.version);
        equal(Spec.ext(spec.version),'gritzko');
        huey.off('age',lsfn);
    });
    huey.age(1);
});

test('create-by-id', function (test) {
    // there is 1:1 spec-to-object correspondence;
    // an attempt of creating a second copy of a model object
    // will throw an exception
    var dewey1 = new Duck('dewey');
    // that's we resort to obtain() doing find-or-create
    var dewey2 = Duck.obtain('dewey');
    // must be the same object
    strictEqual(dewey1,dewey2);
    equal(dewey1.scope().type,'Duck');
});


test('version ids', function (test) {
    var louie = new Duck('louie');
    var ts1 = Spec.newVersion();
    louie.age(3);
    var ts2 = Spec.newVersion();
    ok(ts2>ts1);
    var vid = louie._children.age.version;
    ok(ts1<vid);
    ok(ts2>vid);
});

/* TODO replica boot is the key usecase
test('',function (test) {
    var dewey = Duck.obtain('dewey');
    var json = dewey.toJSON();
    var duckJSON = {
        mood: "neutral", 
        properties: {
            age: 0
        }
    };
    deepEqual(json,duckJSON);
    
});*/

/*test('',function (test) {
    var huey = Duck.obtain('huey');
    expect(2);
    var handle = Duck.addReaction('age', function reaction(spec,val) {
        console.log('yupee im growing');
        equal(val,1);
    });
    Spec.freeze();
    var vid = Spec.newVersion();
    huey.set('/Duck#huey.age!'+vid,1);
    equal(huey._children.age.version,vid);
    Spec.thaw();
    
    Duck.removeReaction('age',handle);
});*/

test('once',function (test) {
    var huey = Duck.obtain('huey');
    expect(1);
    huey.once('age',function(spec,value){
        equal(value,4);
    });
    huey.age(4);
    huey.age(5);
});

test('custom field type',function (test) {
    var huey = Duck.obtain('huey');
    huey.height('32cm');
    ok(Math.abs(huey.height()-0.32)<0.0001);
    Swarm.root.set('/Duck#huey.height','35cm');
    ok(Math.abs(huey.height()-0.35)<0.0001);
    
});

test('vid freeze',function (test) {
    Spec.freeze();
    var factoryBorn = new Duck({age:0,height:'4cm'});
    equal(factoryBorn._id,Spec.frozen);
    Spec.thaw();
    ok(Math.abs(factoryBorn.height()-0.04)<0.0001);
    equal(factoryBorn.age(),0);
    
});

test('batched set',function (test) {
    var nameless = new Duck();
    nameless.set({
        age:1,
        height: '60cm'
    });
    ok(Math.abs(nameless.height()-0.6)<0.0001);
    equal(nameless.age(),1);
    equal(nameless._children.age.version,nameless._children.height.version);
    ok(!nameless.canDrink());
    
});

test('basic Set func',function (test) {
    var hueyClone = new Duck({age:2});
    var deweyClone = new Duck({age:1});
    var louieClone = new Duck({age:3});
    var donalds = new Nest('donalds',{'3rd':deweyClone._id,'2nd':hueyClone._id});
    var dewey2 = donalds.get('3rd');
    ok(deweyClone===dewey2);
    equal(dewey2.age(),1);
    donalds.set('1st',louieClone._id);
    var l2 = donalds.get('1st');
    //equal(l2.get('age'),3); TODO
    equal(l2.age(),3);
    
});
