"use strict";

// This test suite covers various handshake patterns.
// Making an object live demands a connection to an uplink.
// A connection starts with a handshake synchronizing versions on both ends.
// Depending on who has state and who does not, versions on both ends,
// also various concurrency/asynchrony issues, handshakes proceed in different
// ways.

var env = require('../lib/env');
var Op = require('../lib/Op');
var Host = require('../lib/Host');
var Model = require('../lib/Model');
var Storage = require('../lib/Storage');
require('./model/Mice');

env.multihost = true;

/** Must be constructed from String, serialized into a String.
    JSON string is OK :) */
function FullName (name) {
    var m = name.match(/(\S+)\s+(.*)/);
    this.first = m[1];
    this.last = m[2];
}
FullName.prototype.toString = function () {
    return this.first + ' ' + this.last;
};

var Mouse = Model.extend('Mouse', {
    defaults: {
        x: 0,
        y: 0
        //name: FullName
    }
    /*,
    ops: {
        move: function (spec,d) {
            // To implement your own ops you must understand implications
            // of partial order; in this case, if an op comes later than
            // an op that overwrites it then we skip it.
            var version = spec.version();
            if (version<this._version) {
                for(var opspec in this._oplog) {
                    if (opspec > '!' + version) {
                        var os = new Spec(opspec);
                        if (os.op() === 'set' && os.version() > version) {
                            return; // overwritten in the total order
                        }
                    }
                }
            }
            // Q if set is late => move is overwritten!
            this.x += d.x||0;
            this.y += d.y||0;
        }
    }*/
});

//    S O  I T  F I T S

asyncTest('6.a Handshake K pattern', function () {
    console.warn(QUnit.config.current.testName);

    var storage = new Storage();
    var uplink = new Host('swarm~6a',0,storage);
    var downlink = new Host('client~6a',100, new Storage());

    uplink.listen('bat:6a');
    downlink.connect('bat:6a'); // TODO possible mismatch

    env.localhost = uplink;
    var uprepl = new Mouse({x:3,y:3}, uplink);
    var downrepl = new Mouse(uprepl.spec(), downlink);

    downrepl.onInit4(function(ev){
        ok(ev.target===downrepl);
        equal(ev.target.x, 3);
        equal(ev.target.y, 3);
        equal(ev.target._version, uprepl._version);
        start();
    });
});


asyncTest('6.b Handshake D pattern', function () {
    console.warn(QUnit.config.current.testName);

    var storage = new Storage();
    var uplink = new Host('swarm~6b',0,storage);
    var downlink = new Host('client~6b',10000);

    storage.deliver(new Op(
        '/Mouse#Mickey!0eonago.state',
        '{"x":7,"y":7}',
        '0'
    ));

    uplink.listen('bat:6b');
    downlink.connect('bat:6b');

    // TODO
    //  * add testcase: Z-rotten
    //      * old replica with no changes (no rot)
    //      * old repl one-side changes
    //      * old repl two-side changes (dl is rotten)
    //  * document it
    //  * "can't remember whether this was applied" situation
    //      * high concurrency offline use
    //
    //  POSSIBLE underlying assumption: either less than 5 entities
    //  touch it or they don't do it at once (if your case is
    //  different consider RPC impl)
    //  Model.ROTSPAN
    //  Model.COAUTH
    //  (JUST AN OPTION)

    var obj = new Mouse('Mickey', downlink);
    obj.onInit4(function(){
        equal(obj._id,'Mickey');
        equal(obj.x,7);
        equal(obj.y,7);
        equal(obj._version,'!0eonago');
        start();
    });

});

// both uplink and downlink have unsynchronized changes
asyncTest('6.c Handshake Z pattern', function () {
    console.warn(QUnit.config.current.testName);

    var levelup = require('levelup');
    var memdown = require('memdown');
    var db_up = levelup('up', { db: memdown }, function (err, db) {
        //init_data_ul();
    });
    var db_down = levelup('dn', { db: memdown }, function (err, db) {
        //init_data_dl();
    });

    var storage_ul = new Storage(db_up);
    var storage_dl = new Storage(db_down);

    var uplink = new Host('swarm~6c', 0, storage_ul);
    var downlink = new Host('client~6c', 0, storage_dl);

    storage_ul.deliver(
        new Op('/Mouse#Mickey!0eonago.state', '{"x":7,"y":7}', '0')
    );
    storage_ul.deliver(
        new Op('/Mouse#Mickey!11recent+up.set', '{"x":8}', '0')
    );
    storage_dl.deliver(
        new Op('/Mouse#Mickey!0eonago.state', '{"x":7,"y":7}', '0')
    );
    storage_dl.deliver(
        new Op('/Mouse#Mickey!12recent+down.set', '{"y":9}', '0')
    );

    var check1 = false;

    my_start();

    var repl_ul, repl_dl;

    function my_start () {

        repl_ul = new Mouse('Mickey', uplink);
        repl_dl = new Mouse('Mickey', downlink);

        repl_ul.onInit4(function(){
            equal(repl_ul.x, 8);
            equal(repl_ul.y, 7);
            check1 && merge();
            check1 = true;
        });
        repl_dl.onInit4(function(){
            equal(repl_dl.x, 7);
            equal(repl_dl.y, 9);
            check1 && merge();
            check1 = true;
        });

    }

    function merge () {
        uplink.listen('bat:6c');
        downlink.connect('bat:6c');
        setTimeout(mergeCheck, 100);
    }

    function mergeCheck () {
        equal(repl_ul.x, 8);
        equal(repl_ul.y, 9);
        equal(repl_dl.x, 8);
        equal(repl_dl.y, 9);

        repl_dl.set({x:11});
        uplink.clock.checkTimestamp(downlink.clock.lastTimestamp);
        repl_ul.set({x:10});
        repl_dl.set({y:12});

        setTimeout(syncCheck, 100);
    }

    function syncCheck () {
        equal(repl_ul.x, 10);
        equal(repl_ul.y, 12);
        equal(repl_dl.x, 10);
        equal(repl_dl.y, 12);
        start();
    }

});


asyncTest('6.d Handshake R pattern', function () {
    console.warn(QUnit.config.current.testName);

    var uplink = new Host('swarm~6d');
    var downlink = new Host('client~6d');

    uplink.listen('bat:6d');
    downlink.connect('bat:6d');

    env.localhost = downlink;

    var dlrepl = new Mouse({x:0x6d, y:0x6d}, downlink);

    var uprepl = new Mouse(dlrepl.spec(), uplink);

    uprepl.onInit4(function(){
        equal(uprepl.x, 0x6d);
        equal(uprepl.y, 0x6d);
        start();
    });

});


/*asyncTest('6.e Handshake A pattern', function () {
    console.warn(QUnit.config.current.testName);

    var storage = new Storage(false);
    var uplink = new Host('uplink~A');
    var downlink = new Host('downlink~A');
    uplink.getSources = function () {return [storage];};
    downlink.getSources = function () {return [uplink];};
    uplink.on(downlink);
    env.localhost = downlink;

    var mickey = new Mouse({x:20,y:20});
    equal(mickey._id, mickey._version.substr(1));

    // FIXME no value push; this is R actually
    setTimeout(function check(){
        var uprepl = uplink.objects[mickey.spec()];
        var dlrepl = downlink.objects[mickey.spec()];
        equal(uprepl.x,20);
        equal(uprepl.y,20);
        equal(dlrepl.x,20);
        equal(dlrepl.y,20);
        start();
    }, 100);

});*/


asyncTest('6.f Handshake and dl1-ul-dl2 sync', function (test) {
    console.warn(QUnit.config.current.testName);

    var storage = new Storage();
    var uplink = new Host('swarm~6f',0,storage);
    var downlink1 = new Host('client~6f1');
    var downlink2 = new Host('client~6f2');

    uplink.listen('bat:6f');
    downlink1.connect('bat:6f');
    downlink2.connect('bat:6f');

    var mickey_dl1 = new Mouse({x:1,y:2}, downlink1);
    var mickey_dl2 = new Mouse(mickey_dl1.spec(), downlink2);
    var mickey_ul = new Mouse(mickey_dl1.spec(), downlink2);

    var check = false;
    expect(5);

    mickey_dl2.onInit4(function(){
        equal(mickey_dl2.x,1);
        equal(mickey_dl2.y,2);
        check && try_relay();
        check = true;
    });

    mickey_ul.onInit4(function(){
        equal(mickey_ul.x,1);
        equal(mickey_ul.y,2);
        check && try_relay();
        check = true;
    });

    mickey_dl1.on4('set', function(){
        equal(mickey_dl1.x, 3);
        start();
    });

    function try_relay () { // TODO non-trivial concurrency
        mickey_dl2.set({x:3});
    }

});


/*
asyncTest('6.g Cache vs storage',function () {
    console.warn(QUnit.config.current.testName);
    var storage = new Storage(true);
    var cache = new Storage(false);
    cache.id = 'some_cache'; // FIXME
    cache.isRoot = false;
    var uplink = new Host('uplink~G',0,storage);
    var downlink = new Host('downlink~G',0,cache);
    downlink.getSources = function () {return [uplink];};

    var mickey = new Mouse({x:1,y:2}, uplink);

    var copy = downlink.get(mickey.spec());
    copy.on('.state', function (){
        equal(copy.x,1);
        equal(copy.y,2);
        start();
    });

});
*/
