"use strict";

var fs = require('fs');
var rimraf = require("rimraf");
var Swarm = require('../lib/NodeServer');
var Host = require('../lib/Host');
var Spec = require('../lib/Spec');
var LevelStorage = require('../lib/LevelStorage');

Swarm.env.debug = true;
Swarm.env.multihost = true;

var ts = new Swarm.SecondPreciseClock('9').issueTimestamp();
var tsbase = '.test.'+ts+'/';
if (fs.existsSync(tsbase)) {
    rimraf.sync(tsbase);
}
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
                counter.on('.init', function () {
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
    }

    var storage = new LevelStorage(tsbase+'/9b', function() {
        var host = new Host('9b', 0, storage);
        Swarm.env.localhost = host;
        var counter = new Counter();
        counter.on('.init',function() {
            delay(10, function() {
                for(var i=1; i<=100; i++) {
                    counter.set({i:i});
                }
                delay(10, function() {
                    host.close(function() {
                        var storage2 = new LevelStorage(tsbase+'/9b',function() {
                            var host2 = new Host('9b~2', 0, storage2);
                            Swarm.env.localhost = host2;
                            var counter2 = new Counter(counter.spec());
                            counter2.on('.init', function () {
                                equal(counter2.i,100);
                                start();
                            });
                        });
                    });
                });
            });
        });
    });

    /*
    var storage = new LevelStorage(tsbase+'/9b', run1);
        var counter, host, storage2;

        function run1 () {
            host = new Host('9b', 0, storage);
            Swarm.env.localhost = host;
            counter = new Counter();
            counter.on('.init',run11);
        }

        function run11 () {
            setTimeout(run12,10);
        }

        function run12 () {
            for(var i=1; i<=100; i++) {
                counter.set({i:i});
            }
            setTimeout(run14,10);
        }

        function run14 () {
            host.close(run15);
        }

        function run15 () {
            storage2 = new LevelStorage(tsbase+'/9b',run20);
        }

        function run20 (){
            var host2 = new Host('9b~2', 0, storage2);
            Swarm.env.localhost = host2;
            var counter2 = new Counter(counter.spec());
            counter2.on('.init', function () {
                equal(counter2.i,100);
                start();
            });
        }
    });
    */

});


asyncTest('9.c get empty state', function(test){

    var storage = new LevelStorage(tsbase+'/9c', function() {
        storage.readState('/Counter#no_key', function(err, state) {
            ok(!err);
            deepEqual({_version: '!0'}, state);
            start();
        });
    });
});

asyncTest('9.d write&get state', function(test){

    var storage = new LevelStorage(tsbase+'/9d', function() {
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

    var storage = new LevelStorage(tsbase+'/9e', function() {
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
