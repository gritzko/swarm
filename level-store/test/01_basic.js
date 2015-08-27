"use strict";

var Storage = require('..');
var stamp = require('swarm-stamp');

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
        "[loopback:lvl1A#crazy]/Swarm+LvlStore#db!store0+local~ssn.on\t\n" +
        ".error\tbad op format\n"+
        "[EOF]"
},

{
    comment:  "host handshake",
    query:    "[loopback:lvl1A#local]/Swarm#db!host0+local~ssn.on\t\n",
    response: "[loopback:lvl1A#local]/Swarm+LvlStore#db!store1+local~ssn.on\t\n"
},

{
    comment: "(remote) state push + on",
    query:
        "/Type#time1+remote~ssn!time1+remote~ssn.state\tsome state 1\n"+
        "/Type#time1+remote~ssn!stream+remote~ssn.on !time1+remote~ssn\n",
    response:
        "/Type#time1+remote~ssn!stream+remote~ssn.diff\n\n"+
        "/Type#time1+remote~ssn!stream+remote~ssn.on\t!time1+remote~ssn\n"
},

{
    comment: "local op submission (stamp added)",
    query:
        "/Type#time1+remote~ssn.op\tlocal op\n",
    response:
        "/Type#time1+remote~ssn!00000+local~ssn.op\tlocal op\n"
},

{
    comment: "another remote .on (diff with the new op)",
    query:
        "/Type#time1+remote~ssn!stream2+remote~ssn.on\t!time1+remote~ssn\n",
    response:
        "/Type#time1+remote~ssn!stream2+remote~ssn.diff\n" +
            "\t!00000+local~ssn.op\tlocal op\n\n" +
        "/Type#time1+remote~ssn!stream2+remote~ssn.on\t!time1+remote~ssn\n"
},

{
    comment: "feeding remote ops",
    query:
        "/Type#time1+remote~ssn!time2+remote~ssn.op some op\n"+
        "/Type#time1+remote~ssn!time3+remote~ssn.op another op\n"+
        "/Type#time1+remote~ssn!time+remote~ssn.op out-of-order op\n",
    response:
        "/Type#time1+remote~ssn!time2+remote~ssn.op\tsome op\n"+
        "/Type#time1+remote~ssn!time3+remote~ssn.op\tanother op\n"+
        "/Type#time1+remote~ssn!time+remote~ssn.error\top is out of order\n"
    // FIXME error forwarding
},

// BIG FIXME  learned comparator: report differences
//            StreamTest: nicely log differences
/*
{
    comment: "second client handshake",
    query:
    "[loopback:lvl1A#local~ssn2]/Swarm#db!time1+remote~ssn2.on\t\n",
    response:
    "[loopback:lvl1A#local~ssn2]/Swarm#db!0S3+local~ssn.on\t\n"
},*/

{
    comment: "second client on",
    query:
    "/Type#time1+remote~ssn!time1+usr2~sn.on\t\n",
    response:
    "/Type#time1+remote~ssn!time1+usr2~sn.diff\n" +
        "\t!time1+remote~ssn.state\tsome state 1\n" +
        "\t!time2+remote~ssn.op\tsome op\n" +
        "\t!time3+remote~ssn.op\tanother op\n\n" +
    "/Type#time1+remote~ssn!time1+usr2~sn.on\ttime3+remote~ssn\n"
}

];


tape('1.A basic cases', function(t){

    var storage = new Storage({
        ssn_id: 'local~ssn',
        db_id: 'db',
        clock: new stamp.TestClock('local~ssn', {start:'now00'})
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
