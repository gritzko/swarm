"use strict";

var env = require('../lib/env');
var Host = require('../lib/Host');
var Model = require('../lib/Model');
var Storage = require('../lib/Storage');
require('../lib/AsyncLoopbackConnection');

env.multihost = true;
env.debug = console.log;

var Thermometer = Model.extend('Thermometer',{
    defaults: {
        t: -20 // Russia :)
    }
});


asyncTest('3.a serialized on, reon', function (){
    console.warn(QUnit.config.current.testName);
    var storage = new Storage(true);
    storage.isRoot = true;
    var uplink = new Host('swarm~3a',0,storage);
    var downlink = new Host('client~3a',5);
    // that's the default uplink.getSources = function () {return [storage]};

    expect(2);
    uplink.accept('loopback:3a');
    downlink.connect('loopback:a3');

    //downlink.getSources = function () {return [lowerPipe]};

    downlink.on('/Thermometer#room.init',function i(spec,val,obj){
        obj.set({t:22});
    });

    setTimeout(function x(){
        var o = uplink.objects['/Thermometer#room'];
        ok(o); // (1)
        equal(o.t, 22); // (2)
        start();
        downlink.disconnect();
    }, 250);

});


asyncTest('3.b pipe reconnect, backoff', function (){
    console.warn(QUnit.config.current.testName);
    var storage = new Storage(false);
    var uplink = new Host('swarm~3b', 0, storage);
    var downlink = new Host('client~3b');

    uplink.accept('loopback:3b');
    downlink.connect('loopback:b3'); // TODO possible mismatch

    var thermometer = uplink.get(Thermometer), i=0;

    // OK. The idea is to connect/disconnect it 100 times then
    // check that the state is OK, there are no zombie listeners
    // no objects/hosts, log is 1 record long (distilled) etc

    var ih = setInterval(function(){
        thermometer.set({t:i});
        if (i++==30) {
            ok(thermometer._lstn.length<=3); // storage and maybe the client
            clearInterval(ih);
            start();
            uplink.disconnect();
        }
    },100);

    // FIXME sets are NOT aggregated; make a test for that

    downlink.on(thermometer.spec().toString() + '.set', function i(spec,val,obj){
        if (spec.op()==='set') {
            var loopbackPipes = env.streams.loopback.pipes;
            var stream = loopbackPipes['b3'];
            stream && stream.close();
        }
    });

});



asyncTest('3.c Disconnection events', function () {
    console.warn(QUnit.config.current.testName);

    var storage = new Storage(true);
    var uplink = new Host('uplink~C',0,storage);
    var downlink1 = new Host('downlink~C1');
    //var downlink2 = new Host('downlink~C2');
    uplink.getSources = function () {
        return [storage];
    };
    downlink1.getSources = function () {
        return [uplink];
    };
    //downlink2.getSources = function () {return [uplink]};

    uplink.accept('loopback:3c');
    downlink1.connect('loopback:c3');

    env.localhost = downlink1;

    /*var miceA = downlink1.get('/Mice#mice');
    var miceB = downlink2.get('/Mice#mice');
    var mickey1 = downlink1.get('/Mouse');*/

    expect(3);

    downlink1.on('.reoff', function (spec,val,src) {
        equal(src, downlink1);
        ok(!src.isUplinked());
        start();
    });

    downlink1.on('.reon', function (spec,val,src) {
        equal(spec.id(), 'downlink~C1');
        setTimeout(function(){ //:)
            downlink1.disconnect('uplink~C');
        }, 100);
    });
});
