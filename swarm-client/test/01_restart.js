"use strict";
require('swarm-bat');
var Swarm = require('../');
var SwarmClient = Swarm.Client;
var Replica = Swarm.Replica;
var Model = Swarm.Model;
var Host = Swarm.Host;
var tap = require('tap');
var tape = tap.test;

var levelup = require('levelup');
var memdown = require('memdown');
// tap.on('data', function (d) {
//     console.log(d.toString());
// });

/*var tapedom = require('tape-dom');
var parser = require('tap-parser');
var p = parser(add_some_dom);
tap.pipe();*/

Host.multihost = true;


tape ('client.01.A 2 clients sync', function (t) {

    // Replica.debug = true;
    // Host.debug = true;

    // ## Action list
    // 1. user_id '*' (swarm? multiuser cache?)
    // 2. db_id '*' (group options, prefix=true default)
    // 3. ensure user_id, ssn_id
    // 4. ssn grant => writable event
    // 5. passive mode where possible (no clocks) - test
    // 6. additive/cumulative exports
    // 7. REPL cli (client, server) -- play, see log, Set, Model, refs

    t.plan(2);

    var db1 = levelup('client/01/A/1', { db: memdown });
    var db2 = levelup('client/01/A/2', { db: memdown });
    var db3 = levelup('client/01/A/3', { db: memdown });

    var serv_replica = new Replica({
        listen: 'lo:client1A',
        ssn_id: 'swarm',
        db_id:  'db',
        db:     db1
    });

    var client1 = new SwarmClient({
        connect: 'lo:client1A',
        user_id: 'alice',
        db_id:   'db',
        db:     db2
    });

    var client2 = new SwarmClient({
        connect: 'lo:client1A',
        ssn_id:  'bob~0',
        db_id:   'db',
        db:      db3
    });

    client1.host.once('writable', function () {

        var obj1 = new Model({client:1}, client1.host);

        obj1.once('change', function(){
            t.equal(obj1.client, 2);
            if (obj1.client!==2) {
                console.warn('what?');
            }
            client1.close();
            client2.close();
            serv_replica.close();
            t.end();
            process.exit(0);
        });

        var obj2 = client2.get(obj1.typeid());

        obj2.onInit(function(){
            t.equal (obj2.client, 1);
            obj2.set({client:2});
        });

    });

});


// tape('client.01.B session id grant', function (t) {

    //stream.pair.write('/Swarm+Replica#db!00001+swarm~ssn.on user~session\n\n');

    // ENSURE: can read before having clocks
    // ENSURE: 'writable' is emitted by Host/Replica
//
//     t.end();
// });


// tape.skip ('client.01.C offline client session restart', function (t) {
//
//     var client = new SwarmClient({
//         ssn_id: 'joe~1',
//         db_id: 'db',
//         callback: writeAndStop
//     });
//
//     var id;
//
//     function writeAndStop () {
//         var obj = new Model({check: true}, client);
//         obj.set({more:1});
//         id = obj.typeid();
//         client.close(restart);
//     }
//
//     function restart () {
//         var client2 = new SwarmClient({
//             ssn_id: 'joe~1',
//             db_id: 'db'
//         });
//         var obj = client2.get(id);
//         obj.onInit(function(){
//             t.equal(obj.check, true);
//             t.equal(obj.more, 1);
//             t.end();
//         });
//     }
//
// });


// client.01.D multi-db server (prefixed records, no collisions)
