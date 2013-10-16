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
//   0 write the test for tracked props/logged methods/serial/etc : the API end
// V 1 nice stacks, extend only, constructors, no surrogates
// X 2 introspection back NO use addXXX() instead
//   3 trace it all along; get an intuition
// V 4 init(): parent.children[id] = this;   (no create();
//     new>init>children call chain instead)
//
// USABILITY TODOs
//   1 new Model(id) OR new Model(values)

function NumberField (id) {
    this.init(id);
}
Field.extend(NumberField,{
    validate: function (args) {
        return typeof(args.value)==='number';
    }
});

function MetricLengthField (id) {
    this.init(id);
}
Field.extend(MetricLengthField,{
    apply: function (args) {
        // convert mm cm m km
    },
    validate: function (args) {
        return typeof(args.value)==='number';
    },
    toString: function () {
    }
});

// Duck is our core testing class :)
function Duck (id) {
    this.init(id);
    this.mood = 'neutral';
};

Duck.prototype.canDrink = function () {
    return this.age() >= 18;
};

Duck.prototype.mood = function (moodStr) {
    this.mood = moodStr;
};

Model.extend(Duck);
Swarm.addType(Duck);  // Model by default 

Duck.addProperty('age',0,NumberField);
Duck.addProperty('height','5cm',MetricLengthField);
Duck.addMethod(function grow(cm){});
Duck.addCall(function reportAge(){});
Duck.addCall('reportAge');


exports.setUp = function (cb) {
    swarm = new Swarm('gritzko');
    //Swarm.author = 'gritzko';
    cb();
};

exports.testListener = function (test) {
    var huey = new Duck('Huey');
    huey.on('age',function(spec,val){
        test.equal(val,1);
        test.equal(spec.member,'age');
        test.done();
    });
    huey.age(1);
};

exports.testCreate = function (test) {
    var dewey1 = new Duck('dewey');
    var dewey2 = DuckModel.child('dewey');
    test.strictEqual(dewey1,dewey2);
    test.equal(dewey1.type,DuckModel);
};

exports.testRelay = function (test) {
    var dewey = new Duck('dewey');
    dewey.on('age',{
        set : function (args) {
            test.equal(args.spec.toString(),'/Duck#dewey.age');
            test.equal(args.value,2);
            var so = new Spec(spec);
            test.equal(Spec.ext(args.spec.vid),'gritzko');
            test.done();
        }
    });
    dewey.set('age',2);
};

exports.testVids = function (test) {
    var louie = new Duck('louie');
    var ts1 = Spec.vid();
    louie.age(3);
    var ts2 = Spec.vid();
    test.ok(ts2>ts1);
    var vid = louie.properties.age.version;
    test.ok(ts1<vid);
    test.ok(ts2>vid);
    test.done();
};

exports.testJSON = function (test) {
    var duckJSON = {
        mood: 'merry',
        properties: {
            age: 0
        }
    };

};

exports.testStaticCallbacks = function (test) {
    var huey = new Duck('huey');
    test.expect(2);
    Duck.prototype.onto ('age', function (spec,value) {
        test.equal(value,1);
    });
    var vid = Spec.vid();
    huey.set('/Duck#huey.age!'+vid,1);
    test.equal(huey.properties.age.version,vid);
    test.done();
};

exports.testOnce = function (test) {
    var huey = DuckModel.child('huey');
    test.expect(1);
    huey.once('age',function(spec,value){
        test.equal(value,4);
    });
    huey.age(4);
    huey.age(5);
    test.done();
};
