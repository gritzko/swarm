"use strict";
var Swarm = require('..');
var Replica = Swarm.Replica;
var LamportClock = Swarm.LamportClock;

var levelup = require('levelup');
var memdown = require('memdown');

var bat = require('swarm-bat');
var StreamTest = bat.StreamTest;
var BatMux = bat.BatMux;

var tape = require('tap').test;

var NEW_SSN = [
{
    comment: 'handshake - upstream',
    query:   '',
    response:'[up]/Swarm+Replica#db!user\t\n\n'
},
{
    comment: 'the upstream assigns ssn id => on("connection")',
    query:   '[up]/Swarm+Replica#db!timeup+user~parent.on\tuser~parent~ssn\n\n',
    response:''
},
// move to Host
// '#0timf+user~parent~ssn 0\n !0timf+user~parent~ssn.~state {"new":"stamp"}\n\n'
{
    comment: 'downstream#1 knocks',
    query:   '[down1]/Swarm+Host#db!user.on\t\n\n',
    response:'[down1]/Swarm+Replica#db!00001+user~parent~ssn\tuser~parent~ssn~1\n\n'
},
{
    comment: 'downstream#2 knocks; it does not know its user id',
    query:   '[down2]/Swarm+Host#db!0.on\t\n\n',
    response:'[down2]/Swarm+Replica#db!00003+user~parent~ssn\tuser~parent~ssn~2\n\n'
}
];


tape ('replica.01.A ssn assignment', function(t){

    //sync.OpStream.debug = true;

    var mux = new BatMux({
        connect: 'loopback:2A',
        listen:  'loopback:2Aup',
        accept_ids: ['up']
    });

    var db = levelup('replica/01/A', { db: memdown });

    var replica = new Replica({
        user_id:    'user',
        db_id:      'db',
        db:         db,
        connect:    'lo:2Aup',
        clock:      LamportClock,
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
        console.error(err, err.stack);
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
    response:'[up]/Swarm+Replica#db!user \n\n'
},
{
    comment: 'the upstream assigns ssn id (triggers a new obj)',
    query:   '[up]/Swarm+Replica#db!timeup+swarm.on\tuser~ssn\n\n',
    response:'[up]#00001+user~ssn~1 0\n\t!00001+user~ssn~1.~state\t{"00001+user~ssn~1":{"test":true}}\n\n'
},
{
    comment: 'handshake attempt - wrong user id',
    query:   '[wrong1]/Swarm+Host#db!wrong_user.on\t\n\n',
    response:'[wrong1]/Swarm+Replica#db!00003+user~ssn.error\twrong user id\n\n[EOF]'
},
{
    comment: 'handshake attmpt - wrong db id',
    query:   '[wrong2]/Swarm+Host#wrong_db!user.on\t\n\n',
    response:'[wrong2]/Swarm+Replica#db!00004+user~ssn.error\twrong database id\n\n[EOF]'
},
{
    comment: 'handshake attmpt - wrong ssn id',
    query:   '[wrong3]/Swarm+Host#db!time+user~wrong~ssn.on\t\n\n',
    response:'[wrong3]/Swarm+Replica#db!00005+user~ssn.error\twrong ssn (wrong subtree)\n\n[EOF]'
},
{
    comment: 'downstream#1 ssn grant',
    query:   '[down1]/Swarm+Host#db!user.on\t\n\t.passwd\thello\n\n',
    response:'[down1]/Swarm+Replica#db!00006+user~ssn\tuser~ssn~2\n\n'
},
{
    comment: 'downstream#1 subscription',
    query:   '[down1]#zid~author\t0\n\n',
    response:'[up]#zid~author\t0\n\n[down1]#zid~author\t\n\n'
},
/*{
    comment: 'downstream#1 handshake refresh (TODO)',
    query:   '[down1]/Swarm+Host#db!time+user~ssn~1.on\t\n\n',
    response:''
},*/
/*{                 FIXME
    comment: 'wrong state timestamp from a downstream',
    query:   '#0timf+user~ssn 0\n !0timf+user~ssn.~state misattributed\n\n',
    response:'[down1]#0timf+user~ssn.error invalid state origin\n'
},*/
{
    comment: 'wrong op timestamp from a downstream',
    query:   '[down1]#zid~author!time+user~ssn.set value\n',
    response:'[down1]#zid~author!time+user~ssn.error invalid op origin\n'
},
{
    comment: 'downstream#2 wrong password',
    query:   '[down2]/Swarm+Host#db!user.on\t\n\t.passwd\tbye\n\n',
    response:'[down2]/Swarm+Replica#db!00008+user~ssn.error\twrong password\n\n[EOF]'
},
{
    comment: 'downstream#3 no handshake',
    query:   '[down3]#zid+author!stamp+user.set\t{}\n',
    response://'[down3]/Swarm+Replica#db!00009+user~ssn.error\tno handshake\n\n[EOF]'
             '[down3].error not a handshake\n[EOF]'
}
// FIXME: denied downstream push
];


tape ('replica.01.B handshake errors', function (t) {

    // Replica.debug = true;
    // Swarm.StreamOpSource.debug = true;
    // Swarm.OpSource.debug = true;

    var mux = new BatMux({
        connect: 'loopback:2B',
        listen:  'loopback:1B_up',
        accept_ids: ['up']
    });

    var bt = new bat.StreamTest(mux, AUTH, t.equal.bind(t), StreamTest.collapse_spaces);
    bt.run( t.end.bind(t) );

    var db = levelup('replica/00/B', { db: memdown });

    var replica = new Replica({
        user_id:    'user',
        db_id:      'db',
        db:         db,
        upstream:   'loopback:1B_up',
        clock:      LamportClock,
        listen:     'loopback:2B',
        prefix:     true,
        auth_policy: no_bye_policy,
        empty_db:   true
    });

    function no_bye_policy (hs_op, op_stream, callback) {
        var ok = !hs_op.patch || hs_op.patch.length===0 ||
            hs_op.patch[0].value!=='bye';
        callback( ok ? null : 'wrong password' );
    }


    replica.once('connection', function (ev) {
        if (!ev.upstream) {return;}
        var host = new Swarm.Host({clock: LamportClock});
        replica.addOpStreamDown(host);
        host.on('writable', function () {
            new Swarm.Model({test:true}, host);
        });
        host.go();
    });

});
