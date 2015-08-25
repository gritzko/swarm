"use strict";

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}
require('swarm-bat');

var stamp = require('swarm-stamp');
var sync = require('swarm-syncable');
var Host = sync.Host;
var Storage = require('swarm-level-store');
var Model = sync.Model; //require('swarm-types');
var OpStream = sync.OpStream;
var Router = require('..');

/*var Thermometer = Model.extend('Thermometer',{
    defaults: {
        t: -20 // Russia :)
    }
});*/
var Thermometer = Model;


tape ('1.a handshake all the things', function (t){

    Host.multihost = true;
    Host.debug = true;
    Router.debug = true;
    OpStream.debug = true;

    var server_store = new Storage({
        ssn_id: "swarm",
        db_id: "db",
        listen_url: "0:store1a"
    });
    var client_store = new Storage({
        ssn_id: "client~3a",
        db_id: "db"
    });

    var server_router = new Router({
        storage_url: "0:store1a",
        ssn_id: "swarm",
        db_id: "db",
        clock: stamp.TestClock
    });
    var client_router = new Router({ // will learn ssn_id from storage
        storage: client_store,
        listen_url: '0:client3a',
        clock: stamp.TestClock
    });

    var ready = 0;

    // test router-to-storage handshakes
    server_router.on('ready', function (op_stream){
        t.equal(server_router.storage.peer_db_id, 'db', 'server db hs OK');
        t.equal(server_router.db_id, 'db');
        ready++ && connect_routers();
    });

    client_router.on('ready', function (op_stream){
        t.equal(client_router.db_id, 'db');
        t.equal(client_router.storage.peer_db_id, 'db', 'db hs OK');
        t.equal(client_router.ssn_id, 'client~3a', 'client reads in ssn params');
        ready++ && connect_routers();
    });

    // test router-to-router handshakes
    server_router.on('connect', function (op_stream){
        t.equal(op_stream.peer_ssn_id, client_router.ssn_id);
        t.equal(op_stream.peer_db_id, client_router.db_id);
        // storage ssn_id -> router ssn_id -> opstream peer_stamp
        t.equal(op_stream.peer_stamp, '00001+client~3a');
    });

    client_router.on('connect', function (op_stream){
        t.equal(op_stream.peer_ssn_id, server_router.ssn_id, 'srv ssn id recvd');
        t.equal(op_stream.peer_db_id, server_router.db_id, 'srv db id recvd');
        t.equal(op_stream.peer_stamp, '00000+swarm', 'got stamp too');
    });

    // FIXME use loopback:
    function connect_routers () {
        server_router.listen ('0:swarm3a');
        client_router.connect('0:swarm3a');
    }

    /*var client_host = new Host({
        router_url: '0://client3a/',
        ssn_id: 'client3a',
        db_id: 'db'
    });
    client_host.setRouter('0:client3a');
    var server_host = new Host({
        router_url: '0:swarm3a'
    });

    var room = new Model({}, client_host);
    var room_up;

    room.onInit(function i(ev){
        t.equal(this, room, '"this" of a listener if the object');
        this.set({t:22});

        room_up = new Model(room._id, server_host);
        setTimeout(check, 100); // pipes and storage are async
    });

    function check(){
        t.equal(room_up.t, 22, 'value synced upwards');
        client_router.removePeer('0:swarm3a');
        t.end();
        Host.multihost = false;
        Host.debug = false;
        Router.debug = false;
        OpStream.debug = false;
    }*/

});


tape.skip ('1.b reconnect', function (t){
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

    server.listen('bat:3b');
    client.connect('bat:3b', options);

    var thermometer = server.get(Thermometer);
    var thermometer_replica = client.get(thermometer.spec());


    var ih = setInterval(function(){
        if (++round>30) {
            clearInterval(ih);
            t.equal(thermometer_replica.t, 30);
            t.equal(disconnects,10);
            t.end();

        } else {
            thermometer.set({t:round});
        }
    },100);

    client.on('disconnect', function(ev) {
        console.warn('disconnect', ev);
        disconnects++;
    });

    thermometer_replica.on('set', function i(ev){
        if (ev.value.t%3===0) {
            console.warn('terror',ev.value,ev);
            options._delay = undefined;
            server.disconnect('client~3b');
        }
    });

});



tape.skip ('1.c (dis)connection events', function (t) {
    console.warn(QUnit.config.current.testName);
    expect(10);

    var storage = new Storage();
    var server = new Host('swarm~3C',0,storage);
    var client = new Host('client~3C', 0, new Storage());

    server.listen('bat:3c');

    server.on('connect', function(ev) {
        equal(ev.id, client.id);
        equal(ev.spec.op(), 'on');
        equal(ev.spec.author(), 'client');
    });

    server.on('disconnect', function(ev) {
        equal(ev.id, client.id);
        equal(ev.spec.op(), 'off');
    });

    client.on('connect', function(ev) {
        equal(ev.id, server.id);
        equal(ev.spec.op(), 'on');
    });

    client.on('disconnect', function(ev) {
        equal(ev.id, server.id);
        equal(ev.spec.op(), 'off');
    });

    client.connect('bat:3c');

    setTimeout(function(){
        client.disconnect('swarm~3C');
    }, 100);
    setTimeout(function(){
        ok(!(client.id in server.src2ppid)); // no reconnect
        start();
    }, 200);

});


tape.skip ('1.d secondary client_xs', function (t) {

    t.plan(3);

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
    server.listen('bat:3d');
    var client = new Host('client~3d', 0, new Storage());
    client.connect('bat:3d');
    client.listen('bat:3dclient');

    var secondaryA = new Host('client~3d~A');
    secondaryA.getUplink = function(){
        return this.src2ppid['client~3d'];
    };
    secondaryA.connect('bat:3dclient');

    var secondaryB = new Host('client~3d~B');
    secondaryB.getUplink = function(){
        return this.src2ppid['client~3d'];
    };
    secondaryB.connect('bat:3dclient');

    var temp = new Thermometer({
        t: +35
    },secondaryA);

    temp.on('set', function (ev) {
        t.equal(ev.value.t, 34);
        t.end();
    });

    var upper_temp = server.get(temp.spec());
    upper_temp.onInit(function(ev){
        t.equal(upper_temp.t, +35);

        var peer_temp = secondaryB.get(temp.spec());
        peer_temp.onInit(function(ev){
            t.equal(peer_temp.t, +35);
            peer_temp.set({t:+34});
        });

    });

});

/*asyncTest('3.e shortcut links', function () {
    console.warn(QUnit.config.current.testName);
    expect(3);

    /*
         storage
           |
        server
        X    \
  clientB <- clientA

    *

    var storage = new Storage();
    var server = new Host('swarm~3e', 0, storage);
    server.listen('bat:3e');

    var clientA = new Host('client~3eA', 0, new Storage());
    clientA.connect('bat:3e');
    clientA.listen('bat:3eA');

    var clientB = new Host('client~3eB', 0, new Storage());
    // X clientB.connect('loopback:3e');
    clientB.connect('bat:3eA');

    var temp = new Thermometer({
        t: +35
    }, server);

    var tempA = clientA.get(temp.spec());

    tempA.onInit4(function(ev){
        equal(ev.target.t, +35);
        clientA.share(temp.spec(), 'client~3eB');
    });

    var tempB = clientB.get(temp.spec());
    tempB.onInit4(function(ev){
        equal(ev.target.t, +35);
        ev.target.set({t:+36.6});
    });

    temp.on4('set:t', function(ev){
        equal(ev.value.t, +36.6);
        start();
    });

});*/
