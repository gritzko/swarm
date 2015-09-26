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
             '[down]#time1+user~ssn~app\t!time1+user~ssn~app\n\n'
},

{
    comment: 'induct an upstream subscription (no local data)',
    query:   '[down]/Model#stamp2+remote!YYYYY+user~ssn~app.on\t0\n\n',
    response:'[up]#stamp2+remote\t0\n\n' +
             '[down]#stamp2+remote!YYYYY+user~ssn~app\t\n\n'
},
{
    comment: 'server response (downstream .on responded)',
    query:   '[up]#stamp2+remote!00001+user~ssn.on\t0\n' +
                '\t!stamp2+remote.~state\tinitial root state\n\n',
    response:'#stamp2+remote!stamp2+remote.~state\tinitial root state\n'
},

{
    comment: 'downstream .on (bogus bookmark) responded',
    query:   '[down2]#stamp2+remote\tstale+ancient\n\n',
    response:'[down2]#stamp2+remote\t!0\n' +
                '\t!stamp2+remote.~state\tinitial root state\n\n',
},

{
    comment: 'new op from the upstream (echoed)',
    query:   '[up]#stamp2+remote!stampA+user~b.op something happens (A)\n',
    response:'[down]#stamp2+remote!stampA+user~b.op\tsomething happens (A)\n'+
             '[down2]#stamp2+remote!stampA+user~b.op\tsomething happens (A)\n'
},
{
    comment: 'replay (ignored)',
    query:   '[down2]#stamp2+remote!stampA+user~b.op something happens (A)\n',
    response:''
},
{
    comment: 'unsubscription',
    query:   '#stamp2+remote.off\t\n',
    response:'#stamp2+remote.off\t\n'
},

{
    comment: 'subscription+push (new op is the tip)',
    query:   '#stamp2+remote\tstampA+user~b\n'+
                '\t!stampB+user~ssn~two.op\tsomething happens (B)\n\n',
    response:
     '[up]#stamp2+remote!stampB+user~ssn~two.op\tsomething happens (B)\n' +
     '[down]#stamp2+remote!stampB+user~ssn~two.op\tsomething happens (B)\n' +
     '[down2]#stamp2+remote\t!stampB+user~ssn~two\n\n'
},
{
    comment: 'repeated subscription, responded with a patch',
    query:   '[down]#stamp2+remote\tstampA+user~b\n',
    response:'[down]#stamp2+remote\t!0\n' +
                '\t!stampB+user~ssn~two.op\tsomething happens (B)\n\n'
},
{
    comment: 'downstream op (no double relay)',
    query:   '[down]#stamp2+remote!stampC+user~ssn~two.op\tsomething (C)\n',
    response:
        '[up]#stamp2+remote!stampC+user~ssn~two.op\tsomething (C)\n' +
        '[down]#stamp2+remote!stampC+user~ssn~two.op\tsomething (C)\n' +
        '[down2]#stamp2+remote!stampC+user~ssn~two.op\tsomething (C)\n'
},

{
    comment: 'acks, then a new state from the upstream',
    query:
        '[up]#stamp2+remote!stampB+user~ssn~two.op\tsomething happens (B)\n'+
        '#stamp2+remote!stampC+user~ssn~two.op\tsomething (C)\n' +
        '#stamp2+remote!stampC+user~ssn~two.~state\tup to the C\n',
    response:'[down]#stamp2+remote!stampC+user~ssn~two.~state\tup to the C\n' +
             '[down2]#stamp2+remote!stampC+user~ssn~two.~state\tup to the C\n'
},
{
    comment: 'tail-seeking subscription (responded with the tail)',
    query:   '[down]#stamp2+remote\tstamp2+remote\n',
    response:'[down]#stamp2+remote\t!0\n' +
                '\t!stampA+user~b.op\tsomething happens (A)\n'+
                '\t!stampB+user~ssn~two.op\tsomething happens (B)\n'+
                '\t!stampC+user~ssn~two.op\tsomething (C)\n\n'
},
{
    comment: 'blanc subscription (responded with the state)',
    query:   '[down2]#stamp2+remote\t0\n',
    response:'[down2]#stamp2+remote\t!0\n' +
                '\t!stampC+user~ssn~two.~state\tup to the C\n\n'
}

];


tape ('1.A basic cases', function(t){

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


var REORDERS = [
{
    comment: 'handshake - upstream',
    query:   '[up]/Swarm+Replica#db!timeup+swarm.on \n\n',
    response:'[up]/Swarm+Replica#db!00001+me~ssn.on \n\n'
},
{
    comment: 'handshake - downstream I',
    query:   '[dsI]/Swarm+Client#db!timea+me~ssn~dsI.on \n\n',
    response:'[dsI]/Swarm+Replica#db!00002+me~ssn.on \n\n'
},
{
    comment: 'handshake - downstream II',
    query:   '[dsII]/Swarm+Client#db!timeb+me~ssn~dsII.on \n\n',
    response:'[dsII]/Swarm+Replica#db!00003+me~ssn.on \n\n'
},
{
    comment: 'subscription (ds I)',
    query:   '[dsI]#object \n\n',
    response:'[up]#object 0\n\n'+
             '[dsI]#object \n\n'
},
{
    comment: 'server response',
    query:   '[up]#object !0\n'+
                 ' !time0+joe.~state initial_state\n'+
                 ' !time1+joe.op tail_op (1)\n\n',
    response:'#object!time0+joe.~state initial_state\n'+
             '#object!time1+joe.op tail_op (1)\n'
},
{
    comment: 'subscription (ds II)',
    query:   '[dsII]#object time0+joe\n\n',
    response:'[dsII]#object !0\n'+
             ' !time1+joe.op tail_op (1)\n\n'
},

{
    comment: 'feed reordered ops (echo)',
    query:   '[up]#object!time3+joe.op op (2)\n' +
             '[dsII]#object!time2+me~ssn~dsII.op op (3)\n',
    response:'[dsI]#object!time3+joe.op op (2)\n' +
             '[dsII]#object!time3+joe.op op (2)\n' +
             '[up]#object!time2+me~ssn~dsII.op op (3)\n' +
             '[dsI]#object!time2+me~ssn~dsII.op op (3)\n' +
             '[dsII]#object!time2+me~ssn~dsII.op op (3)\n'
},
{
    comment: 'order preservation in a patch',
    query:   '[dsI]#object  time1+joe\n\n',
    response:'[dsI]#object !0\n'+
             ' !time3+joe.op op (2)\n' +
             ' !time2+me~ssn~dsII.op op (3)\n'
},
{
    comment: 'correct patch (tip-stack works)',
    query:   '[dsI]#object  time3+joe\n\n',
    response:'#object !0\n'+
             ' !time2+me~ssn~dsII.op op (3)\n'
},
{
    comment: 'correct empty patch (reordered as a reference)',
    query:   '[dsII]#object  time2+me~ssn~dsII\n\n',
    response:'[dsII]#object !0\n\n'
},

{
    comment: 'a state named after a reordered item',
    query:   '[up]#object!time2+me~ssn~dsII.op op (3)\n'+
             '#object!time2+me~ssn~dsII.~state reordered_state\n',
    response:'[dsI]#object!time2+me~ssn~dsII.~state reordered_state\n'+
             '[dsII]#object!time2+me~ssn~dsII.~state reordered_state\n'
},
{
    comment: 'state served correctly (no tail)',
    query:   '[dsI]#object  \n\n',
    response:'[dsI]#object !0\n'+
             ' !time2+me~ssn~dsII.~state reordered_state\n\n'
},
{
    comment: 'reorder is "straightened"',
    query:   '[dsI]#object!time4+me~ssn~dsI.op op (4)\n',
    response:'[up]#object!time4+me~ssn~dsI.op op (4)\n' +
             '[dsI]#object!time4+me~ssn~dsI.op op (4)\n' +
             '[dsII]#object!time4+me~ssn~dsI.op op (4)\n'
},
{
    comment: 'patch of 1 (straight) op',
    query:   '[dsII]#object  time2+me~ssn~dsII\n\n',
    response:'#object !0\n'+
             ' !time4+me~ssn~dsI.op op (4)\n\n'
},
{
    comment: 'empty patch (straight op is the mark)',
    query:   '[dsI]#object  time4+me~ssn~dsI\n\n',
    response:'[dsI]#object !0\n\n'
},
{
    comment: 'error: causal order violation (disconnect)',
    query:   '[dsII]#object!time1+me~ssn~dsII.op blatant\n',
    response:'[dsII]#object!time1+me~ssn~dsII.error causality violation\n'
}
];


tape('1.B reorders', function(t){

    var replica = new Replica({
        ssn_id:     'me~ssn',
        db_id:      'db',
        upstream:   'swarm',
        clock:      new stamp.LamportClock('me~ssn'),
        listen:     'loopback:1B',
        prefix:     true
    }, start_tests);

    function compare (a,b,c) {
        a = a.replace(/[\t\s]+/g, ' ');
        b = b.replace(/[\t\s]+/g, ' ');
        t.equal(a,b,c);
    }

    function start_tests () {
        var mux = new BatMux('loopback:1B');

        var bt = new bat.StreamTest(mux.trunk, REORDERS, compare);

        bt.runScenario( function () {
            t.end();
        } );
    }

        // FIXME close/open db!!!

});


var ERRORS = [
{
    comment: 'handshake - upstream',
    query:   '[up]/Swarm+Replica#db!timeup+swarm.on \n\n',
    response:'[up]/Swarm+Replica#db!00001+me~ssn.on \n\n'
},
{
    comment: 'handshake - downstream I',
    query:   '[dsI]/Swarm+Client#db!timea+me~ssn~dsI.on \n\n',
    response:'[dsI]/Swarm+Replica#db!00002+me~ssn.on \n\n'
},
{
    comment: 'handshake - downstream II',
    query:   '[dsII]/Swarm+Client#db!timeb+me~ssn~dsII.on \n\n',
    response:'[dsII]/Swarm+Replica#db!00003+me~ssn.on \n\n'
},
{
    comment: 'op for an unknown object',
    query:   '[dsI]#unknown!some+stamp.name and value\n\n',
    response:'[dsI]#unknown!some+stamp.error unknown object\n'
},
{
    comment: 'subscription (ds I)',
    query:   '[dsI]#object \n\n',
    response:'[up]#object 0\n\n'+
             '[dsI]#object \n\n'
},
{
    comment: 'server response',
    query:   '[up]#object !0\n'+
                 ' !time0+joe.~state initial_state\n'+
                 ' !time1+joe.op tail_op (1)\n\n',
    response:'#object!time0+joe.~state initial_state\n'+
             '#object!time1+joe.op tail_op (1)\n\n'
},
{
    comment: 'subscription (unknown stamp, full patch back)',
    query:   '[dsI]#object 0time+ago\n\n',
    response:'#object !0\n'+
                ' !time0+joe.~state initial_state\n'+
                ' !time1+joe.op tail_op (1)\n\n'
},
/*{     TODO; technically, patch ops go before the .on
    comment: 'write to a non-subscribed object',
    query:   '[dsII]#object!time2+me~ssn~dsII.op unexpected, right?\n',
    response:'[dsII]#object!time2+me~ssn~dsII.error no active subscription\n'
},*/
{
    comment: 'bookmark > tip',
    query:   '[dsII]#object ~book+mark\n',
    response:'[dsII]#object.error bookmark is ahead!\n'
},
{
    comment: 'invalid bookmark syntax',
    query:   '[dsII]#object s h i t\n\n',
    response:'#object.error malformed bookmark\n'
}
// TODO db error => graceful termination
];


tape('1.C various errors / incorrect messages', function(t){

    var replica = new Replica({
        ssn_id:     'me~ssn',
        db_id:      'db',
        upstream:   'swarm',
        clock:      new stamp.LamportClock('me~ssn'),
        listen:     'loopback:1C',
        prefix:     true
    }, start_tests);

    function compare (a,b,c) {
        a = a.replace(/[\t\s]+/g, ' ');
        b = b.replace(/[\t\s]+/g, ' ');
        t.equal(a,b,c);
    }

    function start_tests () {
        var mux = new BatMux('loopback:1C');

        var bt = new bat.StreamTest(mux.trunk, ERRORS, compare);

        bt.runScenario( function () {
            t.end();
        } );
    }

});


tape.skip('1.D close/open db', function(t){
});
