/**
 * Created with JetBrains WebStorm.
 * User: gritzko
 * Date: 8/24/13
 * Time: 6:21 PM
 * To change this template use File | Settings | File Templates.
 */

if (typeof require == 'function') {
    var Swarm = require('../lib/swarm2.js');
    Spec = Swarm.Spec;
    Model = Swarm.Model;
} else {
    exports = this.testModelRelay = {};
}

function Duck (name) {
    this.init(name);
    this.age = 0;
}

Duck.prototype.grow = function grow () {
    this.setAge(this.age+1);
};

Swarm.author = '&gritzko';
Swarm.Model.extend(Duck, {});


exports.setUp = function (cb) {
    cb();
};

exports.testListener = function (test) {
    var huey = new Duck('Huey');
    huey.on('age',function(key,val){
        test.equal(val,1);
        test.equal(key.member,'age');
        test.done();
    });
    huey.setAge(1);
};

exports.testRelay = function (test) {
    var dewey1 = new Duck('dewey');
    var dewey2 = new Duck('dewey');
    dewey1.on(dewey2);
    dewey2.on('age',{
        set : function (spec,val) {
            test.equal(spec.toString(),'/Duck#dewey.age');
            test.equal(val,2);
            var so = new Spec(spec);
            test.equal(so.author,'gritzko');
            test.done();
        }
    });
    dewey1.set('age',2);
};

exports.testVids = function (test) {
    var louie = new Duck('louie');
    var ts1 = Spec.ts();
    louie.setAge(3);
    var ts2 = Spec.ts();
    test.ok(ts2>ts1);
    var vid = louie._vid.age;
    test.ok(ts1<vid);
    test.ok(ts2>vid);
    test.done();
};

exports.testStaticCallbacks = function (test) {
    var huey = new Duck('huey');
    test.expect(2);
    Duck.prototype.onAge = function (value) {
        test.equal(value,1);
    };
    var vid = Spec.vid();
    huey.set('/Duck#huey.age'+vid,1);
    test.equal(huey._vid.age,vid);
    test.done();
};
