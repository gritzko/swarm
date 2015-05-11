"use strict";

var Swarm = require('../');
var Host = Swarm.Host;
var Storage = Swarm.Storage;
require('../bat/TestServer');

var levelup = require('levelup');
var memdown = require('memdown');
var db = levelup('xxx', { db: memdown });

Swarm.env.debug = true;
Swarm.env.multihost = true;
Swarm.env.logs.op = true;

var storage = new Storage(db);
var host = new Host('loc~al', 0, storage);
host.listen('test:strings');

var stream = host.servers['test:strings'].dual_stream;

Swarm.env.logs.op = true;
/*var host = {
    resp: '',
    deliver: function (spec, val) {
        this.resp+=spec+'\t'+val+'\n';
    },
    response: function () {
        var ret = this.resp;
        this.resp = '';
        return ret;
    }
};*/

var DIALOGUES = [

{
    query: [
        "&crazy\tAbRA cAdaBra"
    ],
    response: [
        "&crazy .error invalid spec: AbRA",
        "&crazy:CLOSED"
    ]
},

{
    query: [
        "&usr~ssn /Host#usr+ssn!time0.on "
    ],
    response: [
        "&usr~ssn /Host#loc~al!time0.reon $TIME"
    ]
},

{
    query: [
        "&usr~ssn /Type#time1+usr~ssn!time1+usr~ssn.state some state 1",
        "&usr~ssn /Type#time1+usr~ssn!time101+usr~ssn.on !time1+usr~ssn",
        "&usr~ssn /Type#time1+usr~ssn!time2+usr~ssn.op some op",
        "&usr~ssn /Type#time1+usr~ssn!time3+usr~ssn.op another op",
        "&usr~ssn /Type#time1+usr~ssn!time+usr~ssn.op out-of-order op"
    ],
    response: [
        "&usr~ssn /Type#time1+usr~ssn!time101+usr~ssn.bundle",
        "&usr~ssn /Type#time1+usr~ssn!time101+usr~ssn.reon !time1+usr~ssn",
        "&usr~ssn /Type#time1+usr~ssn!time2+usr~ssn.op some op",
        "&usr~ssn /Type#time1+usr~ssn!time3+usr~ssn.op another op",
        "&usr~ssn /Type#time1+usr~ssn!time+usr~ssn.error op is out of order"
    ]
}/*,

{
    query: [

    ],
    response: [

    ]
}*/

];


asyncTest('4. dialogues', function(test){
    console.warn(QUnit.config.current.testName);

    var i=0;
    var exchange;

    sendQuery();

    function sendQuery () {
        console.warn(QUnit.config.current.testName + ' round #' + i);

        exchange = DIALOGUES[i];
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
        }*/
        var expected = exchange.response.join('\n')+'\n';

        equal(response, expected);

        if (++i<DIALOGUES.length) {
            sendQuery();
        } else {
            start();
        }
    }
});
