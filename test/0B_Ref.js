"use strict";

var env = require('../lib/env');
var Spec = require('../lib/Spec');
var Syncable = require('../lib/Syncable');
var Storage = require('../lib/Storage');
var Model = require('../lib/Model');
var Ref = Syncable.Ref;
var Host = require('../lib/Host');

var BiblicalPerson = Model.extend('BiblicalPerson',{
    defaults: {
        name: "",
        parent: {type:Ref,value:'#0'}
    },
    getName: function () {return this.name;}
});


test('B.a ref init', function(test){
    var storage = new Storage(false);
    var host = new Host('local~Ba1',0,storage);
    env.localhost = host;

    var abraham  = new BiblicalPerson({name:"Abraham"},host);
    var isaac  = new BiblicalPerson("ISAAC",host);
    isaac.set({name:"Isaac"});

    var ref1 = new Ref("ISAAC", BiblicalPerson);
    ref1.fill();
    ok(ref1._target===isaac); //1

    var ref2 = new Ref(abraham);
    ref2.call("getName",[],function(name){
        equal(name,"Abraham"); //2
    });
    ok(ref2._target===abraham); //3

    var op = isaac.set({parent:abraham});
    equal(isaac.parent.constructor, Ref); //4
    isaac.parent.fill();
    equal(isaac.parent._target, abraham); //5

    var stored_tail = storage.tails[isaac.spec()];
    var stored_op_val = stored_tail[new Spec(op).filter('!.')];
    equal(stored_op_val, '{"parent":"'+abraham.spec()+'"}'); //6
    equal(isaac.parent.toPojo(),abraham.spec()); //7

    var host2 = new Host('local~Ba2',0,storage);
    var isaac2 = host2.get(isaac.spec());
    ok(isaac2!==isaac); //8
    equal(isaac2._version, isaac._version); //9 synchronous
    isaac2.parent.fill(host2); // FIXME
    var abraham2 = isaac2.parent._target;
    ok(abraham2!==abraham); //10
    equal(abraham2._id, abraham._id); //11
    equal(abraham2.name,"Abraham"); //12

    env.localhost = null;
});


test('B.b op propagation', function(test){
    var storage_up = new Storage(false);
    var uplink = new Host('local~Bb1',0,storage_up);
    var storage_dl = new Storage(false);
    var downlink = new Host('local~Bb2',0,storage_dl);
    downlink.getSources = function () {return [uplink];};
    uplink.on(downlink);
    env.localhost = downlink;

    var joseph_up  = new BiblicalPerson({name:"Joseph"},uplink);
    var jesus_up  = new BiblicalPerson({
        name: "Jesus",
        parent: joseph_up
    },uplink);
    equal(jesus_up.parent.constructor,Ref); // 1
    jesus_up.fill();
    ok(jesus_up.parent._target===joseph_up); // 2
    var jesus_ops = storage_up.tails[jesus_up.spec()];
    equal(jesus_ops['!'+jesus_up._id+'.set'],  // 3 serialized POJO
        '{"name":"Jesus","parent":"'+joseph_up.spec()+'"}');

    var jesus = downlink.get(jesus_up.spec()); // see state go down
    jesus.fill();
    var joseph = jesus.parent._target; // ref
    equal(joseph.name,"Joseph"); // 4 repl object

    var op = jesus_up.set({parent:null}); // see op in the storage
    //equal(storage_dl.tails[op], '{"parent":"#0"}');
    //equal(jesus.parent.ref,'#0');
    equal(jesus.parent,null); // 5 TODO null or #0 ?

    var john  = new BiblicalPerson({name:"John"},downlink);
    var peter  = new BiblicalPerson({
        name: "Simon Peter",
        parent: john
    },downlink);
    var andrew  = new BiblicalPerson({
        name: "Andrew"
    },downlink);
    var op2 = andrew.set({parent:john.spec()});
    //equal(storage_dl.tails[op2], '{"parent":"'+john.spec()+'"}'); // 6
    andrew.fill();
    equal(andrew.parent._target, john); // 7

    var peter_up = uplink.get(peter.spec());
    peter_up.fill();
    equal(peter_up.parent._target._id, john._id);
    equal(peter_up.parent._target.name, "John");
    equal(peter_up.parent._target._host, uplink);

    env.localhost = null;
});


asyncTest('B.c ref fill/call', function(test){
    var storage = new Storage(true);
    var host1 = new Host('local~Bc1',0,storage);
    env.localhost = host1;

    storage.states['/BiblicalPerson#ABRAHAM'] = JSON.stringify({
        _version: '!0eonago',
        name: "Abraham",
        parent: "#0"
    });
    storage.states['/BiblicalPerson#ISAAC'] = JSON.stringify({
        _version: '!0eonago',
        name: "Isaac",
        parent: "/BiblicalPerson#ABRAHAM"
    });
    storage.states['/BiblicalPerson#JACOB'] = JSON.stringify({
        _version: '!0eonago',
        name: "Jacob",
        parent: "/BiblicalPerson#ISAAC",
        _oplog:{
            '!0eonago+god.set': {parent:"#Isaac", name:"Jacob"}
        }
    });

    // 1. async load, once, onLoad
    var jacob1 = host1.get('/BiblicalPerson#JACOB');
    jacob1.once(function(){ // TODO onLoad
        equal(this.name,"Jacob"); //1
        equal(this.parent.constructor,Ref); // 2
        ok(!this.parent.isNull()); // 3
        this.parent.once(function(){
            equal(this.name,"Isaac"); // 4
            ok(!this.parent.isNull()); // 5
            this.parent.once(function(){
                equal(this.name,"Abraham"); // 6
                ok(this.parent.isNull()); // 7
                env.localhost = null;
                start();
            });
        });
    });

});
