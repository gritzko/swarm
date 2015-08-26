"use strict";

var Storage = require('..');
var TestClock = require('swarm-stamp').TestClock;

var bat = require('swarm-bat');

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}


var DIALOGUES_4A_BASIC = [

{
    comment: "crazy client",
    query:  "[loopback:lvl1A#crazy]\tAbRA cAdaBra\n",
    response:
        "[loopback:lvl1A#crazy]/Swarm+LvlStore#db!0S~00000+local~ssn.on\t\n" +
        ".error\tbad op format\n"+
        "[EOF]"
},

{
    comment:  "client 1 handshake",
    query:    "[loopback:lvl1A#local~ssn]/Swarm#db!stamp+local~ssn.on\t\n",
    response: "[loopback:lvl1A#local~ssn]/Swarm+LvlStore#db!0S~00001+local~ssn.on\t\n"
},

{
    comment: "(remote) state push + on",
    query:
    "/Type#time1+usr~ssn!time1+usr~ssn.state\tsome state 1\n"+
    "/Type#time1+usr~ssn!time0+usr~ssn.on !time1+usr~ssn\n",
    response:
    "/Type#time1+usr~ssn!time0+usr~ssn.diff\n\n"+
    "/Type#time1+usr~ssn!time0+usr~ssn.on\t!time1+usr~ssn\n"
},

{
    comment: "feeding ops",
    query:
    "/Type#time1+usr~ssn!time2+usr~ssn.op some op\n"+
    "/Type#time1+usr~ssn!time3+usr~ssn.op another op\n"+
    "/Type#time1+usr~ssn!time+usr~ssn.op out-of-order op\n",
    response:
    "/Type#time1+usr~ssn!time2+usr~ssn.op\tsome op\n"+
    "/Type#time1+usr~ssn!time3+usr~ssn.op\tanother op\n"+
    "/Type#time1+usr~ssn!time+usr~ssn.error\top is out of order\n"
    // FIXME error forwarding
},

// BIG FIXME  learned comparator: report differences
//            StreamTest: nicely log differences
/*
{
    comment: "second client handshake",
    query:
    "[loopback:lvl1A#local~ssn2]/Swarm#db!time1+usr~ssn2.on\t\n",
    response:
    "[loopback:lvl1A#local~ssn2]/Swarm#db!0S3+local~ssn.on\t\n"
},*/

{
    comment: "second client on",
    query:
    "/Type#time1+usr~ssn!time1+usr2~sn.on\t\n",
    response:
    "/Type#time1+usr~ssn!time1+usr2~sn.diff\n" +
        "\t!time1+usr~ssn.state\tsome state 1\n" +
        "\t!time2+usr~ssn.op\tsome op\n" +
        "\t!time3+usr~ssn.op\tanother op\n\n" +
    "/Type#time1+usr~ssn!time1+usr2~sn.on\ttime3+usr~ssn\n"
}

];


tape('1.A basic cases', function(t){

    var storage = new Storage({
        ssn_id: 'local~ssn',
        db_id: 'db'
    });

    storage.listen('loopback:lvl1A', testit );

    function testit () {

        var mux = new bat.BatMux('mux', 'loopback:lvl1A');

        var bt = new bat.StreamTest(mux.trunk, DIALOGUES_4A_BASIC, t.equal.bind(t));

        bt.runScenario( function () {
            t.end();
        } );

    }

});


/*asyncTest('4.D dialogues', function(test){
    console.warn(QUnit.config.current.testName);

    var i=0;
    var exchange;

    sendQuery();

    function sendQuery () {
        console.warn(QUnit.config.current.testName + ' round #' + i);

        exchange = DIAOLGUES[i];
        stream.write(exchange.query.join('\n')+'\n');
        setTimeout(checkResponse, 10);
    }

    function checkResponse () {
        var response = (stream.read()||'').toString();
        response = response.replace(/[ \t]+/g,' ');
        response = response.replace(/\.reon\s+\d{4,20}/,'.reon $TIME');

        /*var responses = response.match(Host.LineBasedSerializer.line_re);
        for(var j=0; j<responses.length; j++) {
            responses[j] = responses[j].replace(/\n$/,'');
        }*
        var expected = exchange.response.join('\n')+'\n';

        equal(response, expected);

        if (++i<DIALOGUES.length) {
            sendQuery();
        } else {
            start();
        }
    }
});*/
