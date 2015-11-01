
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
{
    comment: 'handshake - upstream',
    query:   '',
    response:'[up]/Swarm+Replica#db!user.on\t\n\n'
},
{
    comment: 'the upstream assigns ssn id => on("connect"), 1st op stamped',
    query:   '[up]/Swarm+Replica#db!timeup+user~parent.on\tuser~parent~ssn\n\n',
    response:''
},
// move to Host
// '#0timf+user~parent~ssn 0\n !0timf+user~parent~ssn.~state {"new":"stamp"}\n\n'
{
    comment: 'downstream#1 knocks',
    query:   '[down1]/Swarm+Host#db!user.on\t\n\n',
    response:'[down1]/Swarm+Replica#db!00001+user~parent~ssn.on\tuser~parent~ssn~1\n\n'
},
{
    comment: 'downstream#2 knocks; it does not know its user id',
    query:   '[down2]/Swarm+Host#db!0.on\t\n\n',
    response:'[down2]/Swarm+Replica#db!00003+user~parent~ssn.on\tuser~parent~ssn~2\n\n'
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
        clock:      stamp.LamportClock,
        listen:     'loopback:2A',
        adopt:      true,
        prefix:     true,
        //callback:   start_tests
    });

    var conn_event = false;

    replica.once('connection', function (event){
        conn_event = true;
        t.equal(event.ssn_id, 'user~parent', 'session id');
        t.equal(replica.ssn_id, 'user~parent~ssn', 'replicas ssn');
        t.equal(replica.upstream_stamp, 'timeup+user~parent', 'upstream stamp');
    });

    //function start_tests () {

    mux.on('error', function (err) {
        console.error(err);
    });

    var bt = new bat.StreamTest(mux, NEW_SSN, t.equal.bind(t));

    bt.run( function () {
        t.ok(conn_event, 'connection event');
        t.end();
    } );
    //}

});


// TODO error handshakes:
//  * wrong user, wrong db, wrong ssn
//  * bad op stamp
//  * bad password
//  * \n is a keepalive
//  * repeat handshake
//  * no handshake
var AUTH = [
{
    comment: 'handshake is received by the upstream',
    query:   '',
    response:'[up]/Swarm+Replica#db!0.on \n\n'
},
{
    comment: 'the upstream assigns user, ssn ids (triggers a new obj)',
    query:   '[up]/Swarm+Replica#db!timeup+swarm.on\tuser~ssn\n\n',
    response:'#0timf+user~ssn 0\n !0timf+user~ssn.~state {"new":"stamp"}\n\n'
},
{
    comment: 'handshake attempt - wrong user id',
    query:   '[wrong1]/Swarm+Host#db!wrong_user.on\t\n\n',
    response:'[wrong1]/Swarm+Replica#db!00001+user~ssn.error\twrong user\n\n[EOF]'
},
{
    comment: 'handshake attmpt - wrong db id',
    query:   '[wrong2]/Swarm+Host#wrong_db!user.on\t\n\n',
    response:'[wrong2]/Swarm+Replica#db!00002+user~ssn.error\twrong db\n\n[EOF]'
},
{
    comment: 'handshake attmpt - wrong ssn id',
    query:   '[wrong3]/Swarm+Host#db!user~wrong~ssn.on\t\n\n',
    response:'[wrong3]/Swarm+Replica#db!00003+user~ssn.error\twrong ssn\n\n[EOF]'
},
{
    comment: 'downstream#1 ssn grant',
    query:   '[down1]/Swarm+Host#db!user.on\t\n\t.passwd\thello\n\n',
    response:'[down1]/Swarm+Replica#db!00004+user~ssn.on\tuser~ssn~1\n\n'
},
{
    comment: 'downstream#1 subscription',
    query:   '#id~author\t0\n\n',
    response:'[up]#id~author\t0\n\n'
},
{
    comment: 'downstream#1 handshake refresh (TODO)',
    query:   '[down1]/Swarm+Host#db!time+user~ssn~1.on\t\n\n',
    response:''
},
{
    comment: 'wrong state timestamp from a downstream',
    query:   '#0timf+user~ssn 0\n !0timf+user~ssn.~state misattributed\n\n',
    response:'[down1]#0timf+user~ssn.error invalid state origin\n'
},
{
    comment: 'wrong op timestamp from a downstream',
    query:   '#object!time+user~ssn value\n',
    response:'#object!time+user~ssn.error invalid op origin\n'
},
{
    comment: 'downstream#2 wrong password',
    query:   '[down2]/Swarm+Host#db!user.on\t\n\t.passwd\tbye\n\n',
    response:'[down2]/Swarm+Replica#db!00005+user~ssn.error\twrong password\n\n[EOF]'
},
{
    comment: 'downstream#3 no handshake',
    query:   '[down3]#id!stamp+user.set\t{}\n',
    response:'[down3].error\tno handshake\n\n[EOF]'
}
// FIXME: denied downstream push
];


tape.skip('2.B handshake errors', function (t) {

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
