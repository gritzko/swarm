"use strict";
var stamp = require('swarm-stamp');
var Replica = require('..');

var bat = require('swarm-bat');
var BatMux = bat.BatMux;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}


var BASIC = [
{
    comment: 'handshake - upstream',
    query:   '[up]/Swarm+Replica#db!timeup+swarm.on\t\n\n',
    response:'[up]/Swarm+Replica#db!00001+user~ssn.on\t\n\n'
},
{
    comment: 'handshake - downstream I',
    query:   '[down]/Swarm+Client#db!timedn+user~ssn~app.on\t\n\n',
    response:'[down]/Swarm+Replica#db!00002+user~ssn.on\t\n\n'
},
{
    comment: 'handshake - downstream II',
    query:   '[down2]/Swarm+Client#db!timedn2+user~ssn~two.on\t\n\n',
    response:'[down2]/Swarm+Replica#db!00003+user~ssn.on\t\n\n'
},

{
    comment: 'push a new object in',
    query:   '[down]#time1+user~ssn~app\t0\n'+
                 '\t!time1+user~ssn~app.~state\tsome state\n\n',
    response:'[up]#time1+user~ssn~app\t0\n'+
                 '\t!time1+user~ssn~app.~state\tsome state\n\n'+
             '[down]#time1+user~ssn~app\ttime1+user~ssn~app\n\n'
},

{
    comment: 'induct an upstream subscription (no local data)',
    query:   '[down]/Model#stamp2+remote!YYYYY+user~ssn~app.on\t0\n\n',
    response:'[up]#stamp2+remote\t0\n\n' +
             '[down]#stamp2+remote!YYYYY+user~ssn~app\t0\n\n'
},
{
    comment: 'server response (downstream .on responded)',
    query:   '[up]#stamp2+remote!00001+user~ssn.on\t0\n' +
                '\t!stamp2+remote.~state\tinitial root state\n\n',
    response:'#stamp2+remote!stamp2+remote.~state\tinitial root state\n'
},

{
    comment: 'downstream .on (bogus bookmark) responded',
    query:   '[down2]#stamp2+remote\t!stale~ancient\n\n',
    response:'[down2]#stamp2+remote\t!0\n' +
                '\t!stamp2+remote.~state\tinitial root state\n\n',
},

{
    comment: 'new op from the upstream (echoed)',
    query:   '[up]#stamp2+remote!stamp3+user~b.op something happens\n',
    response:'[down]#stamp2+remote!stamp3+user~b.op\tsomething happens\n'+
             '[down2]#stamp2+remote!stamp3+user~b.op\tsomething happens\n'
},

{
    comment: 'replay (ignored)',
    query:   '@swarm/Model#id!time1+user~b.op something happens\n',
    response:''
},
{
    comment: 'invited upstream subscription (new op is the tip)',
    query:   '/Model#id!0+swarm.on \n',
    response:'/Model#id!0+swarm.on !time1+user~b\n'
},
{
    comment: 'downstream subscription diff (responded with the op)',
    query:   '@user~ssn/Model#id!stamp+user~ssn.on !time0+user~b\n',
    response:'@user~ssn/Model#id!stamp+user~ssn.on \n' +
                ' !time1+user~b.op something happens\n\n'
},
{
    comment: 'invited subscription again (same simple vector)',
    query:   '/Model#id!0+swarm.on \n',
    response:'/Model#id!0+swarm.on !time1+user~b\n'
},
{
    comment: 'a new state from the upstream',
    query:   '@swarm/Model#id!stamp+swarm.on \n' +
                ' !time1+user~b.~state second root state\n\n',
    response:''
},
{
    comment: 'downstream subscription (responded with the new state)',
    query:   '@user~ssn/Model#id!stamp+user~ssn.on !time0+user~b\n',
    response:'@user~ssn/Model#id!stamp+user~ssn.on \n' +
                ' !time1+user~b.~state second root state\n\n'
}

];


tape('1.A basic cases', function(t){

    var replica = new Replica({
        ssn_id:     'user~ssn',
        db_id:      'db',
        upstream:   'swarm',
        clock:      new stamp.LamportClock('user~ssn'),
        listen:     'loopback:1A',
        prefix:     true
    }, start_tests);

    function start_tests () {
        var mux = new BatMux('loopback:1A');

        var bt = new bat.StreamTest(mux.trunk, BASIC, t.equal.bind(t));

        bt.runScenario( function () {
            t.end();
        } );
    }

});


var ERRORS = [
    // patch for an unknown object
    // ack in the future (unknown op)
    // invalid specs
    // state 0 (correct)
    // state in a race (ignored)
    // db error => graceful termination
];

var REORDERS = [
{
    comment: 'handshake - server',
    query:   '[swarm]/Swarm#db!stamp+swarm.on \n\n',
    response:'[swarm]/Swarm#db!00000+user~ssn.on \n\n'
},
{
    comment: 'create an object by a fake server response',
    query:   '/Model#id!stamp1+swarm.on \n' +
                ' !time0+user.state initial root state\n\n',
    response:''
},
{
    comment: 'handshake - client',
    query:   '[client]/Swarm#db!stamp+user~b.on \n\n',
    response:'[client]/Swarm#db!00001+user~ssn.on \n\n'
},
{
    comment: 'feed reordered ops (echo)',
    query:   '/Model#id!time1+user~b.op something happens\n' +
             '/Model#id!time0+user~b.op something else happens\n',
    response:'/Model#id!time1+user~b.op something happens\n' +
             '/Model#id!time0+user~b.op something else happens\n' +
             '[swarm]/Model#id!time1+user~b.op something happens\n' +
             '/Model#id!time0+user~b.op something else happens\n'
},
{
    comment: 'order preservation in a patch',
    query:   '/Model#id!stamp2+user~ssn.on \n\n',
    response:'[client]/Model#id!stamp2+user~ssn.on \n' +
                ' !time1+user~b.op something happens\n' +
                ' !time0+user~b.op something else happens\n\n'
},
{
    comment: 'correct patch (backreferences work)',
    query:   '/Model#id!stamp3+user~ssn.on !time1+user~b\n\n',
    response:'/Model#id!stamp3+user~ssn.on \n' +
                ' !time0+user~b.op something else happens\n\n'
},
{
    comment: 'correct empty patch (backreference passing works too)',
    query:   '/Model#id!stamp4+user~ssn.on !time1+user~b!time0+user~b\n\n',
    response:'/Model#id!stamp4+user~ssn.on \n\n'
},
{
    comment: 'get a patch with upstream reorders',
    query:   '[swarm]/Model#id2!stamp5+swarm.on \n' +
                ' !time3+userB.op Alice\n' +
                ' !time3+userA.op Bob\n\n',
    response:''
},
{
    comment: 'invited subscription: reorders are reflected',
    query:   '[client]/Model#id2!0+swarm.on \n\n',
    response:'[swarm]/Model#id2!0+swarm.on !time3+userB.op!time3+userA.op\n\n'
},
{
    comment: 'upstream tip advances',
    query:   '[swarm]/Model#id2!time4+userC.op Carol\n', ///  OOPS
    response:'/Model#id2!time4+userC.op Carol\n'
},
{
    comment: 'invited subscription: reorders are gone',
    query:   '/Model#id2!0+swarm.on \n\n',
    response:'/Model#id2!0+swarm.on !time4+userC\n\n'
},
{
    comment: 'important: ack of a compound-stamp op',
    query:   '',
    response:''
},
{
    comment: '',
    query:   '',
    response:''
},
{
    comment: '',
    query:   '',
    response:''
},
{
    comment: '',
    query:   '',
    response:''
}
];


var SNAPSHOTS_AND_REORDERS = [
{
    comment: '',
    query:   '',
    response:''
},
{
    comment: '',
    query:   '',
    response:''
}
];
