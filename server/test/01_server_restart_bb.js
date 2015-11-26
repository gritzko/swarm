"use strict";
require('stream-url-node');
var fs = require('fs');
var rimraf = require('rimraf');
var stamp = require('swarm-stamp');
var SwarmServer = require('..');
var bat = require('swarm-bat');

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}

// this is not a bare Replica, but a Replica+Host server-side combo
// which must aggregate logs into states properly
var AGG = [
{
    comment: 'upstream handshake, subscriptions initiated',
    query:   '[alice]/Swarm+Host#db!Alice.on \n\n',
    response:'[alice]/Swarm+Replica#db!00001+swarm~1A\tAlice~1\n\n'
},
{
    comment: 'client pushes an object',
    query:   '[alice]#00002+Alice~1\t\n' +
             '\t!00002+Alice~1.~state\t{"old":true,"alice":1}\n\n',
    response:'[alice]#00002+Alice~1\t!00002+Alice~1\n\n'
},
{
    comment: 'client pushes an op (echo)',
    query:   '[alice]#00002+Alice~1!00003+Alice~1.set\t{"alice":2}\n',
    response:'[alice]#00002+Alice~1!00003+Alice~1.set\t{"alice":2}\n'
},
{
    comment: 'new client connects, gets ssn',
    query:   '[bob]/Swarm+Host#db!Bob.on \n\n',
    response:'[bob]/Swarm+Replica#db!00003+swarm~1A\tBob~2\n\n'
},
{
    comment: 'fresh subscription (log is aggregated)',
    query:   '[bob]#00002+Alice~1\t0\n\n',
    response:'[bob]#00002+Alice~1\t!0\n' +
             '\t!00003+Alice~1.~state\t{"old":true,"alice":2}\n\n'
}
];


tape ('server.1.A log aggregation', function (t) {
    var db_path = '.test_db_server.1.A';
    fs.existsSync(db_path) && rimraf.sync(db_path);
    var port = 10000+Math.floor(Math.random() * 10000);
    var listen_url = 'tcp://localhost:'+port;
    if (fs.existsSync(db_path)) {
        fs.unlinkSync(db_path);
    }
    var server = new SwarmServer({
        listen: listen_url,
        ssn_id: 'swarm~1A',
        db_id:  'db',
        db_path: db_path,
        clock:  stamp.LamportClock,
        callback: run
    });

    var mux = new bat.BatMux({
        connect: listen_url
    });

    var bt = new bat.StreamTest(mux, AGG, t.equal.bind(t));

    function run () {
        bt.run(end);
    }

    function end () {
        server.close();
        fs.existsSync(db_path) && rimraf.sync(db_path);
        t.end();
    }

});
