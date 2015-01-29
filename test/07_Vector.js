"use strict";

var env = require('../lib/env');
var Spec = require('../lib/Spec');
var Model = require('../lib/Model');
var Vector = require('../lib/Vector');
var Host = require('../lib/Host');
var Storage = require('../lib/Storage');

var Agent = Model.extend('Agent', {
    defaults: {
        name: 'Anonymous',
        num: -1,
        gun: "IMI Desert Eagle",
        dressCode: "Business"
    }
});

var vhost = new Host('matrix',0);

env.localhost = vhost;

var smith = new Agent({name:'Smith', num:1});
var jones = new Agent({name:'Jones', num:2});
var brown = new Agent({name:'Brown', num:3});

var AgentVector = Vector.extend('AgentVector',{
    objectType: Agent
});

function checkOrder(vec) {
    var names = [];
    vec.objects.forEach(function(o){ names.push(o.name); });
    equal(names.join(), 'Smith,Jones,Brown');
}

test('7.a init vector', function (test) {
    env.localhost = vhost;
    var vec = new Vector();
    vec.insert(smith);
    vec.insert(brown,0);
    vec.insert(jones,smith);
    checkOrder(vec);
});

/*test('7.b ordered insert', function (test) {
    env.localhost = vhost;
    var vector = new Vector();
    function order(a,b) {
        return a.num - b.num;
    }
    vector.setOrder(order);
    vector.insert(jones);
    vector.insert(smith);
    vector.insert(brown);
    checkOrder(vec);
});*/

test('7.c insert/remove', function (test) {
    env.localhost = vhost;
    var vec = new AgentVector();
    // default object type
    vec.insert(smith);
    vec.insertAfter(brown._id,smith);
    vec.remove(smith);
    vec.insert(jones.spec());
    vec.insertBefore(smith,jones.spec());
    checkOrder(vec);
});

test('7.d concurrent insert', function (test) {
    env.localhost = vhost;
    function cb () {
        throw new Error('what?');
    }

    var vec = new Vector('vecid');
    var smithOp = Spec.as(vec.insert(smith)).tok('!');
    var t1 = vhost.time().replace('+'+vhost._id, '+src2');
    var t2 = vhost.time().replace('+'+vhost._id, '+src1');

    vec.deliver ('/Vector#vecid!'+t2+'.in', jones.spec()+smithOp, cb);
    vec.deliver ('/Vector#vecid!'+t1+'.in', brown.spec()+smithOp, cb);
    checkOrder(vec);
    equal(vec._order.toString(), smithOp+'!'+t2+'!'+t1);

    var vec2 = new AgentVector('vecid2');
    var smithOp2 = Spec.as(vec2.insert(smith)).tok('!');
    t1 = vhost.time().replace('+'+vhost._id, '+src2');
    t2 = vhost.time().replace('+'+vhost._id, '+src1');

    vec2.deliver ('/Vector#vecid2!'+t1+'.in', brown.spec()+smithOp2, cb);
    vec2.deliver ('/Vector#vecid2!'+t2+'.in', jones.spec()+smithOp2, cb);
    checkOrder(vec2);
    equal(vec2._order.toString(), smithOp2+'!'+t2+'!'+t1);
});

test('7.e dead point', function (test) {
    env.localhost = vhost;
    var vec = new Vector();
    // keeps
    vec.insert(smith);
    var pos = vec._order.tokenAt(0); // !time
    vec.remove(smith);
    var t1 = vhost.time().replace('+'+vhost._id, '+src2');
    var t2 = vhost.time().replace('+'+vhost._id, '+src1');
    function cb () {
        // nothing
    }
    vec.deliver(vec.spec()+'!'+t2+'.in', jones.spec()+pos, cb);
    vec.deliver(vec.spec()+'!'+t1+'.in', brown.spec()+pos, cb);
    vec.insertBefore(smith,jones);
    checkOrder(vec);
});

/*test('7.f splits: O(N^2) prevention', function (test) {
    // ONE! MILLION! ENTRIES!
    env.localhost = vhost;
    var vec = new Vector();
    // insert 1mln entries at pos i%length
    // TODO O(N^0.5) offset anchors
});*/

/*test('7.g log compaction', function (test) {   TODO HORIZON
    // values essentially reside in the _oplog
    // compaction only brings benefit on numerous repeated rewrites
    // over long periods of time (>EPOCH)
    env.localhost = vhost;
    var vec = new Vector();
    // /Type#elem ( !pos (offset)? )?
}); */

test('7.h duplicates', function (test) {
    env.localhost = vhost;
    var vec = new AgentVector();
    vec.insert(smith);
    vec.insertAfter(smith._id);
    vec.insertAfter(smith.spec()); // take that :)
    equal(vec.objects[0],smith);
    equal(vec.objects[1],smith);
    equal(vec.objects[2],smith);
});

test('7.l event relay', function (test) {
    var ids = [];
    var vec = new AgentVector();
    vec.insert(smith);
    vec.insert(smith);
    vec.insert(smith);
    vec.onObjectEvent(function(spec,val,src){
        ids.push(src.name);
    });
    smith.set({weapon:'bug'});
    equal(ids.join(),'Smith,Smith,Smith');
    vec.remove(1);
    //vec.move(1,0);
    ids = [];
    smith.set({weapon:'mighty fist'});
    equal(ids.join(),'Smith,Smith');
});


test('7.i Array-like API', function (test) {
    env.localhost = vhost;
    var vec = new AgentVector();
    vec.append(smith);
    vec.append(smith);
    vec.append(smith);
    vec.append(brown);
    equal(vec.indexOf(brown._id),3);
    equal(vec.indexOf(brown.spec()),3);
    equal(vec.indexOf(brown),3);
    equal(vec.indexOf(smith._id),0);
    equal(vec.indexOf(smith._id,1),1);
    //vec.splice(1,2,jones);
    //checkOrder(vec);
});

/*test('7.j sugary API', function (test) {
    var vec = new Vector();
    vec.insert(jones);
    vec.insertAfter(smith,jones);
    vec.insertBefore(brown,smith);
    vec.move('smith',0);
    checkOrder(vec);
    var i = vec.iterator();
    equal(i.object.name,'Smith');
    i.next();
    equal(i.object.name,'Jones');
    i.next();
    equal(i.object.name,'Brown');
});*/

/*test('7.k long Vector O(N^2)', function (test){
    var vec = new Vector();
    var num = 500, bignum = num << 1; // TODO 1mln entries (need chunks?)
    for(var i=0; i<bignum; i++) { // mooore meee!!!
        vec.append(smith);
    }
    for(var i=bignum-1; i>0; i-=2) {
        vec.remove(i);
    }
    equal(vec.length(), bignum>>1);
    equal(vec.objects[0].name,'Smith');
    equal(vec.objects[num-1].name,'Smith');
});*/

test('7.l onObjectEvent / offObjectEvent', function () {
    env.localhost = vhost;
    var vec = new AgentVector();
    vec.insert(smith);
    expect(2);

    function onAgentChanged() {
        ok(true);
    }

    vec.onObjectEvent(onAgentChanged);
    smith.set({dressCode: 'Casual'});
    smith.set({gun: 'nope'});

    vec.offObjectEvent(onAgentChanged);
    smith.set({gun: 'IMI Desert Eagle'});
});

asyncTest('7.m onObjectStateReady', function () {
    var asyncStorage = new Storage(true);
    env.localhost = null;
    var host = new Host('async_matrix', 0, asyncStorage);
    env.localhost = host;

    var vec = host.get('/AgentVector#test7l');

    var agents = [];
    for (var i = 0; i < 10; i++) {
        var agent = host.get('/Agent#smith_' + i);
        agents.push(agent);
        vec.insert(agent);
    }

    expect(21);

    // not inited at the beginning (+10 assertions)
    agents.forEach(function (agent) {
        ok(!agent._version);
    });


    vec.onObjectStateReady(function () {
        // check vector and all its entries inited (+1 assertion)
        ok(!!vec._version);
        // (+10) assertions
        agents.forEach(function (agent) {
            ok(!!agent._version);
        });

        start();
    });
});
