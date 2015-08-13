"use strict";

var Storage = require('..');
var TestClock = require('swarm-stamp').TestClock;

var bat = require('swarm-bat');

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.stream(tape);
}


var DIALOGUES_4A_BASIC = [

{
    query:  "[loopback:lvl1A#crazy]\tAbRA cAdaBra\n",
    response:
        "[loopback:lvl1A#crazy].error\tbad msg format\n"+
        "[EOF]"
},

{
    query:    "[loopback:lvl1A#usr~ssn]/Swarm#db!stamp+usr~ssn.on\t\n",
    response: "[loopback:lvl1A#usr~ssn]/Swarm#db!stamp+store.on\t\n"
},

{
    query:
    "/Type#time1+usr~ssn!time1+usr~ssn.state\tsome state 1\n"+
    "/Type#time1+usr~ssn!time0+usr~ssn.on !time1+usr~ssn\n",
    response:
    "/Type#time1+usr~ssn!time0+usr~ssn.diff\n\n"+
    "/Type#time1+usr~ssn!time0+usr~ssn.on\t!time1+usr~ssn\n"
},

{
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

{
    query:
    "[loopback:lvl1A#usr2~sn]/Swarm#db!time1+usr2~sn.on\t\n",
    response:
    "[loopback:lvl1A#usr2~sn]/Swarm#db!time1+store.on\t\n"
},

{
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

    var storage = new Storage();

    storage.listen('loopback:lvl1A');

    var mux = new bat.BatMux('mux', 'loopback:lvl1A');

    var bt = new bat.StreamTest(mux.trunk, DIALOGUES_4A_BASIC, t.equal.bind(t));

    bt.runScenario( function () {
        t.end();
    } );

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
