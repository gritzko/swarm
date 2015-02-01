"use strict";

var fs = require('fs');
var Swarm = require('../lib/NodeServer');
var Host = require('../lib/Host');
var FileStorage = require('../lib/FileStorage');


Swarm.env.debug = true;
Swarm.env.trace = false;
Swarm.env.multihost = true;

var Counter = Swarm.Model.extend('Counter',{
    defaults: {
        i: 0
    }
});

var ts = new Swarm.SecondPreciseClock('8').issueTimestamp();
var tsbase = '.test.'+ts+'/';
fs.mkdirSync(tsbase);

asyncTest('8.a init and save', function(test){
    console.warn(QUnit.config.current.testName);

    var storage = new FileStorage(tsbase+'8a');
    var host = new Host('counters', 0, storage);
    Swarm.env.localhost = host;
    storage.MAX_LOG_SIZE = 100;

    var counter = new Counter('8a');

    counter.onStateReady(function () {
        // wait for for storage reon or following counter changes will be the part of state (_tail)
        setTimeout(function waitForStorageReon() {

            var spec = counter.set({i:1});

            host.close(function () {
                var fn = storage.logFileName();
                var logstr = fs.readFileSync(fn, 'utf8');
                var log = JSON.parse(logstr);
                var correctLog = {'': {}};
                correctLog[spec] = {i: 1};

                deepEqual(log, correctLog);

                start();
            });
        }, 10);
    });
});

asyncTest('8.b log trimming', function(test){
    console.warn(QUnit.config.current.testName);

    var storage = new FileStorage(tsbase+'8b');
    var host = new Host('counters~8b', 0, storage);
    Swarm.env.localhost = host;
    storage.MAX_LOG_SIZE = 3;

    var counter = new Counter('8b');

    counter.onStateReady(function () {

        // wait for for storage reon or following counter changes will be the part of state (_tail)
        setTimeout(function waitForStorageReon() {
            var specs = [];
            for(var i=0; i<=storage.MAX_LOG_SIZE; i++) {
                specs.push(counter.set({i:i}));
            }
            var newOp = counter.set({i:i});

            // tadaam
            storage.rotateLog();

            host.close(function () {
                var fn = storage.logFileName();
                var logstr = fs.readFileSync(fn, 'utf8');
                var log = JSON.parse(logstr);

                var ti = newOp.filter('/#');
                var vm = newOp.filter('!.');

                var correctLog = {};
                correctLog[ti] = {};
                correctLog[ti][vm] = {i: i};

                deepEqual(log[''], correctLog);

                start();
            });

        }, 10);
    });
});

asyncTest('8.c state/log load', function(test){
    console.warn(QUnit.config.current.testName);

    var storage = new FileStorage(tsbase+'8c');
    var host = new Host('counters~8c', 0, storage);
    Swarm.env.localhost = host;
    storage.MAX_LOG_SIZE = 3;

    var counter = new Counter('8c');

    counter.onStateReady(function () {

        // wait for for storage reon or following counter changes will be the part of state (_tail)
        setTimeout(function waitForStorageReon() {

            var specs = [];
            for(var i=0; i<=storage.MAX_LOG_SIZE; i++) {
                specs.push(counter.set({i:i}));
            }
            counter.set({i:i});

            host.close(function () {

                var storage2 = new FileStorage(tsbase + '8c');
                var host2 = new Host('counters~8c~v2', 0, storage2);
                var counter2 = host2.get(counter.spec());
                counter2.onStateReady(function () {
                    equal(counter2.i, i);
                    start();
                });

            });
        }, 10);
    });

});
