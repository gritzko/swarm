"use strict";

var fs = require('fs');
var rimraf = require("rimraf");
var Swarm = require('../lib/NodeServer');
var Host = require('../lib/Host');
var LevelStorage = require('../lib/LevelStorage');
var levelup = require('level');

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
