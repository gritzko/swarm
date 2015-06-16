"use strict";

var env = require('../lib/env');
var Spec = require('../lib/Spec');
var Op = require('../lib/Op');
var Host = require('../lib/Host');
var Model = require('../lib/Model');
var Storage = require('../lib/Storage');
require('../lib/AsyncLoopbackConnection');

env.multihost = true;
env.debug = console.log;
env.logs.op = true;

var Thermometer = Model.extend('Thermometer',{
    defaults: {
        t: -20 // Russia :)
    }
});


asyncTest('3.a serialized on, reon', function (){
    console.warn(QUnit.config.current.testName);
    env.trace = true;
    var storage = new Storage();
    var uplink = new Host('swarm~3a', 0, storage);
    var downlink = new Host('client~3a', 5, new Storage());

    uplink.listen('loopback:3a');
    downlink.connect('loopback:3a'); // TODO possible mismatch

    uplink.deliver(new Op('/Thermometer#room!0time.state', '{}', uplink.id));
    //downlink.getSources = function () {return [lowerPipe]};
    var room = new Thermometer('room',downlink), room_up;

    room.onInit4(function i(ev){
        ev.target.set({t:22});

        room_up = new Thermometer('room', uplink);
        setTimeout(check, 10); // pipes and storage are async
    });

    function check(){
        equal(room_up.t,22);
        start();
        downlink.disconnect();
        env.trace = false;
    }

});


asyncTest('3.b reconnect', function (){
    console.warn(QUnit.config.current.testName);
    //env.logs.net = true;
    //env.logs.logix = true;
    var storage = new Storage();
    var server = new Host('swarm~3b', 0, storage);
    var client = new Host('client~3b', 0, new Storage());
    var disconnects = 0, round = 0;

    var options = {
        reconnect: true,
        reconnectDelay: 1
    };

    server.listen('loopback:3b');
    client.connect('loopback:3b', options);

    var thermometer = server.get(Thermometer);
    var thermometer_replica = client.get(thermometer.spec());


    var ih = setInterval(function(){
        if (++round>30) {
            clearInterval(ih);
            equal(thermometer_replica.t, 30);
            equal(disconnects,10);
            start();
            env.logs.net = false;
            env.logs.logix = false;
        } else {
            thermometer.set({t:round});
        }
    },100);

    client.on4('disconnect', function(ev) {
        console.warn('disconnect', ev);
        disconnects++;
    });

    thermometer_replica.on4('set', function i(ev){
        if (ev.value.t%3===0) {
            console.warn('terror',ev.value,ev);
            options._delay = undefined;
            server.disconnect('client~3b');
        }
    });

});



asyncTest('3.c (dis)connection events', function () {
    console.warn(QUnit.config.current.testName);
    expect(10);

    var storage = new Storage();
    var server = new Host('swarm~3C',0,storage);
    var client = new Host('client~3C', 0, new Storage());

    server.listen('loopback:3c');

    server.on4('connect', function(ev) {
        equal(ev.id, client.id);
        equal(ev.spec.op(), 'on');
        equal(ev.spec.author(), 'client');
    });

    server.on4('disconnect', function(ev) {
        equal(ev.id, client.id);
        equal(ev.spec.op(), 'off');
    });

    client.on4('connect', function(ev) {
        equal(ev.id, server.id);
        equal(ev.spec.op(), 'reon');
    });

    client.on4('disconnect', function(ev) {
        equal(ev.id, server.id);
        equal(ev.spec.op(), 'reoff');
    });

    client.connect('loopback:3c');

    setTimeout(function(){
        client.disconnect('swarm~3C');
    }, 100);
    setTimeout(function(){
        ok(!(client.id in server.anyid2peerid)); // no reconnect
        start();
    }, 200);

});


asyncTest('3.d secondary downlinks', function () {
    console.warn(QUnit.config.current.testName);
    //env.logs.net = true;

    expect(3);

    /*
         storage
           |
        server
          |
        client
        /   \
secondaryA secondaryB

    */

    var storage = new Storage();
    var server = new Host('swarm~3d', 0, storage);
    server.listen('loopback:3d');
    var client = new Host('client~3d', 0, new Storage());
    client.connect('loopback:3d');
    client.listen('loopback:3dclient');

    var secondaryA = new Host('client~3d~A');
    secondaryA.getUplink = function(){ 
        return this.src2ppid['client~3d']; 
    };
    secondaryA.connect('loopback:3dclient');

    var secondaryB = new Host('client~3d~B');
    secondaryB.getUplink = function(){ 
        return this.src2ppid['client~3d']; 
    };
    secondaryB.connect('loopback:3dclient');

    var temp = new Thermometer({
        t: +35
    },secondaryA);

    temp.on4('set', function (ev) {
        equal(ev.value.t, 34);
        env.logs.net = false;
        start();
    });

    var upper_temp = server.get(temp.spec());
    upper_temp.onInit4(function(ev){
        equal(upper_temp.t, +35);

        var peer_temp = secondaryB.get(temp.spec());
        peer_temp.onInit4(function(ev){
            equal(peer_temp.t, +35);
            peer_temp.set({t:+34});
        });

    });

});

asyncTest('3.e shortcut links', function () {
    console.warn(QUnit.config.current.testName);
    expect(3);

    /*
         storage
           |
        server
        X    \
  clientB <- clientA

    */

    var storage = new Storage();
    var server = new Host('swarm~3e', 0, storage);
    server.listen('loopback:3e');

    var clientA = new Host('client~3eA', 0, new Storage());
    clientA.connect('loopback:3e');
    clientA.listen('loopback:3eA');

    var clientB = new Host('client~3eB', 0, new Storage());
    // X clientB.connect('loopback:3e');
    clientB.connect('loopback:3eA');

    var temp = new Thermometer({
        t: +35
    }, server);

    var tempA = clientA.get(temp.spec());

    tempA.onLoad4(function(ev){
        equals(ev.target.t, +35);
        clientA.share(temp.spec(), 'client~3eB');
    });

    var tempB = clientB.get(temp.spec());
    tempB.onLoad4(function(ev){
        equals(ev.target.t, +35);
        ev.target.set({t:+36.6});
    });

    temp.on4('set:t', function(ev){
        equal(ev.value.t, +36.6);
        start();
    });

});
