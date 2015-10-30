
"use strict";
var stamp = require('swarm-stamp');
var Replica = require('..');
var sync = require('swarm-syncable');

var bat = require('swarm-bat');
var BatMux = bat.BatMux;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}


var NEW_SSN = [
// ssn id assignment necessitates strict handshake sequence:
// the client introduces itself first. That matches the logic
// of the spanning tree quite nicely. P2P shortcut links can
// still behave the way they want.
{
    comment: 'handshake - upstream',
    query:   '',
    response:'[up]/Swarm+Replica#db!user.on\t\n\n'
},
/*{
    comment: 'downstream#1 knocks; please come later',
    query:   '[down1]/Swarm+Host#db!user.on\t\n\n',
    response:'[down1]/Swarm+Replica#db!user.off\tno active session yet\n\n'
},*/
{
    comment: 'the upstream assigns ssn id',
    query:   '[up]/Swarm+Replica#db!timeup+swarm.on\tuser+ssn\n\n',
    response:''
},
{
    comment: 'downstream#1 retries',
    query:   '[down1]/Swarm+Host#db!user.on\t\n\n',
    response:'[down1]/Swarm+Replica#db!00001+user~ssn.on\tuser~ssn~1\n\n'
},
{
    comment: 'downstream#2 knocks; it does not know its user id',
    query:   '[down2]/Swarm+Host#db!0.on\t\n\n',
    response:'[down2]/Swarm+Replica#db!00003+user~ssn.on\tuser~ssn~2\n\n'
}
];


tape ('2.A ssn assignment', function(t){
    sync.OpStream.debug = true;

    var mux = new BatMux({
        connect: 'loopback:2A',
        listen:  'loopback:2Aup',
        accept_ids: ['up']
    });

    var replica = new Replica({
        user_id:    'user',
        db_id:      'db',
        upstream:   'lo:2Aup',
        clock:      new stamp.LamportClock('user~ssn'),
        listen:     'loopback:2A',
        adopt:      true,
        prefix:     true,
        //callback:   start_tests
    });

    //function start_tests () {

        mux.on('error', function (err) {
            console.error(err);
        });

        var bt = new bat.StreamTest(mux.trunk, NEW_SSN, t.equal.bind(t));

        bt.runScenario( t.end.bind(t) );
    //}

});


var AUTH = [
{
    comment: 'handshake is received by the upstream',
    query:   '',
    response:'[up]/Swarm+Replica#db!me.on \n\n'
},
{
    comment: 'ssn assigned by the upstream => on("connect"), 1st op stamped',
    query:   '[up]/Swarm+Replica#db!0time+swarm.on me~1\n\n',
    response:'#0timf 0\n !0timf.~state {"new":"stamp"}\n\n'
},
{
    comment: 'handshake - downstream I',
    query:   '[dsI]/Swarm+Client#db!me.on \n\n',
    response:'[dsI]/Swarm+Replica#db!0timg+me~1.on me~1~1\n\n'
},
{
    comment: 'handshake - downstream II',
    query:   '[dsII]/Swarm+Client#db!0.on \n\n',
    response:'[dsII]/Swarm+Replica#db!0timh+me~1.on me~1~2\n\n'
},
{
    comment: 'downstream II - first stamp',
    query:   '[dsII]#0timi+me~1~2 0\n !0timi+me~1~2.~state {"y":2}\n\n',
    response:'[up]#0timi+me~1~2 0\n !0timi+me~1~2.~state {"y":2}\n\n'
}
];


tape.skip('2.B auth/sessions', function (t) {

    var replica = new Replica({
        ssn_id:     'me~ssn',
        db_id:      'db',
        upstream:   'swarm',
        clock:      new stamp.LamportClock('me~ssn'),
        listen:     'loopback:2B',
        prefix:     true
    }, start_tests);

    function compare (a,b,c) {
        a = a.replace(/[\t\s]+/g, ' ');
        b = b.replace(/[\t\s]+/g, ' ');
        t.equal(a,b,c);
    }

    function start_tests () {
        var mux = new BatMux({
            connect: 'loopback:2B',
            listen:  'loopback:1B_up'
        });

        var bt = new bat.StreamTest(mux.trunk, AUTH, compare);

        bt.runScenario( function () {
            t.end();
        } );
    }

});
