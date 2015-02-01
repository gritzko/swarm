"use strict";

var fs = require('fs');
var Swarm = require('../lib/NodeServer');
var Host = require('../lib/Host');
var Spec = require('../lib/Spec');
var LevelStorage = require('../lib/LevelStorage');
var leveldown = require('leveldown');

Swarm.env.debug = true;
Swarm.env.multihost = true;

var ts = new Swarm.SecondPreciseClock('9').issueTimestamp();
var tsbase = '.test.'+ts+'/';
fs.mkdirSync(tsbase);

var Counter = Swarm.Model.extend('Counter',{
    defaults: {
        i: 0
    }
});

/*asyncTest('9.a load', function(test){
    var db = levelup(tsbase+'/9a');
    db.batch(
        [
            {
                type:  'put',
                key:   '/Counter#ten',
                value: JSON.stringify({
                    _version: "!09",
                    i: 9
                })
            },
            {
                type:  'put',
                key:   '/Counter#ten!10.set',
                value: '{"i":10}'
            }
        ],
        function (err) {
            ok(!err);
            db.close(function () {
                var storage = new LevelStorage(tsbase+'/9a');
                var host = new Host('9a', 0, storage);
                Swarm.env.localhost = host;
                var counter = new Counter('ten');
                counter.onStateReady(function () {
                    equal(counter.i,10);
                    start();
                });
            });
        }
    );

});*/

asyncTest('9.b write&read', function(test){

    var delay = function(ms, fn) {
        setTimeout(fn, ms);
    };

    var storage = new LevelStorage('lvl', {
            path: tsbase+'/9b',
            db: leveldown
        });
    storage.open(function() {
        var host = new Host('9b', 0, storage);
        Swarm.env.localhost = host;
        var counter = new Counter();
        counter.onStateReady(function() {
            delay(10, function() {
                for(var i=1; i<=100; i++) {
                    counter.set({i:i});
                }
                delay(10, function() {
                    host.close(function() {
                        var storage2 = new LevelStorage('lvl2',
                            {path:tsbase+'/9b',db:leveldown});
                        storage2.open(function() {
                            var host2 = new Host('9b~2', 0, storage2);
                            Swarm.env.localhost = host2;
                            var counter2 = new Counter(counter.spec());
                            counter2.onStateReady(function () {
                                equal(counter2.i,100);
                                start();
                            });
                        });
                    });
                });
            });
        });
    });


});


asyncTest('9.c get empty state', function(test){
    var storage = new LevelStorage('lvl', {path:tsbase+'/9c',db:leveldown});
    storage.open(function() {
        storage.readState('/Counter#no_key', function(err, state) {
            equal(err,undefined);
            deepEqual(state, {_version: '!0'});
            start();
        });
    });
});

asyncTest('9.d write&get state', function(test){

    var storage = new LevelStorage('lvl9d',{path:tsbase+'/9d',db:leveldown});
    storage.open(function() {
        var state = {someState: 'someValue'};
        storage.writeState(new Spec('/Counter#some_key'), state, function(err) {
            ok(!err);
            storage.readState('/Counter#some_key', function(err, s) {
              ok(!err);
              deepEqual(state, s);
              start();
            });
        });
    });
});

asyncTest('9.e write&get ops', function(test){

    var storage = new LevelStorage('lvl9e',{path:tsbase+'/9e',db:leveldown});
    storage.open(function() {
        var op = {someOp: 'someValue'};
        storage.writeOp(new Spec('/Counter#some_key!1234'), op, function(err) {
            ok(!err);
            storage.readOps('/Counter#some_key', function(err, ops) {
              ok(!err);
              equal(Object.keys(ops).length, 1);
              deepEqual(ops['!1234'], op);
              start();
            });
        });
    });
});
