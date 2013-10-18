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
} else {
    exports = this.testModelRelay = {};
}

// BACK TO SANITY
// V 0 write a test for tracked props/logged methods/serial/etc : the API end
// V 1 nice stacks, extend only, constructors, no surrogates
// X 2 introspection back NO use addXXX() instead
//   3 trace it all along; get an intuition
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
//   1' parent tree
//    a duck.parent===duckType
//    b root.obtain('/Duck#huey')
//   2 batch field set
//      huey.set({age:1,height:"30cm"})
//      // including replica bootup
//   3 init(id) vs init(value), frozen vid
// V 4 three-position signature
//      Spec.normalize(arguments);
//      var spec=arguments[0], value=arguments[1], listener=arguments[2];
//   5 fieldTypes - ???

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
    apply: function (args) {
        // convert mm cm m km
    },
    validate: function (spec,val) {
        return typeof(val)==='number';
    },
    toString: function () {
    }
});

// Duck is our core testing class :)
function Duck (id) {
    this.init(id);
    // mood is mutated by a logged method
    this.mood = 'neutral';
    //this.height = 30;
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


exports.setUp = function (cb) {
    // only make it a local variable; it installs itself as THE swarm
    // anyway; setups with multiple swarm objects need additional care
    cb();
};
    var root = new Swarm('gritzko');

exports.tearDown = function (cb) {
    //Swarm.root.close();
    cb();
};

exports.testListener = function (test) {
    // construct an object with an id provided; it will try to fetch
    // previously saved state for the id (which is none)
    var huey = new Duck('Huey');
    // listen to a field
    huey.on('age',function(spec,val){
        test.equal(val,1);
        // spec is a compund identifier;
        // field name is mentioned as 'member'
        test.equal(spec.member,'age');
        test.equal(spec.toString(),'/Duck#Huey.age!'+spec.version);
        test.equal(Spec.ext(spec.version),'gritzko');
        test.done();
    });
    huey.age(1);
};

exports.testCreate = function (test) {
    // there is 1:1 spec-to-object correspondence;
    // an attempt of creating a second copy of a model object
    // will throw an exception
    var dewey1 = new Duck('dewey');
    // that's we resort to obtain() doing find-or-create
    var dewey2 = Duck.obtain('dewey');
    // must be the same object
    test.strictEqual(dewey1,dewey2);
    test.equal(dewey1.scope().type,'Duck');
    test.done();
};


exports.testVids = function (test) {
    var louie = new Duck('louie');
    var ts1 = Spec.newVersion();
    louie.age(3);
    var ts2 = Spec.newVersion();
    test.ok(ts2>ts1);
    var vid = louie._children.age.version;
    test.ok(ts1<vid);
    test.ok(ts2>vid);
    test.done();
};

/* TODO replica boot is the key usecase
exports.testJSON = function (test) {
    var dewey = Duck.obtain('dewey');
    var json = dewey.toJSON();
    var duckJSON = {
        mood: "neutral", 
        properties: {
            age: 0
        }
    };
    test.deepEqual(json,duckJSON);
    test.done();
};*/

exports.testStaticCallbacks = function (test) {
    var huey = new Duck('huey');
    test.expect(2);
    var handle = Duck.addReaction('age', function(spec,val) {
        console.log('yupee im growing');
        test.equal(val,1);
    });
    Spec.freeze();
    var vid = Spec.newVersion();
    huey.set('/Duck#huey.age!'+vid,1);
    test.equal(huey._children.age.version,vid);
    Spec.thaw();
    test.done();
    Duck.removeReaction('age',handle);
};

exports.testOnce = function (test) {
    var huey = Duck.obtain('huey');
    test.expect(1);
    huey.once('age',function(spec,value){
        test.equal(value,4);
    });
    huey.age(4);
    huey.age(5);
    test.done();
};
