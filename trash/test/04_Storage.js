"use strict";

var Swarm = require('../');
var Host = Swarm.Host;
var Storage = Swarm.Storage;
var TestClock = require('../lib/TestClock');

var bat = require('swarm-bat');
require('./bat-link');

var levelup = require('levelup');
var memdown = require('memdown');
var db = levelup('xxx', { db: memdown });

Swarm.env.debug = true;
Swarm.env.multihost = true;
Swarm.env.logs.op = true;

var dmp = require('googlediff');

QUnit.diff = function (a, b) {
    var d = new dmp();
	var diff = d.diff_main(b, a);
	var ret = '', tag;
	diff.forEach(function(chunk){
		switch (chunk[0]) {
		case 0: tag = 'span'; break;
		case 1: tag = 'ins'; break;
		case -1: tag = 'del'; break;
		}
		ret += '<'+tag+'>' + chunk[1] + '</'+tag+'>';
	});
	return ret;
};

/*var host = {
    resp: '',v
    deliver: function (spec, val) {
        this.resp+=spec+'\t'+val+'\n';
    },
    response: function () {
        var ret = this.resp;
        this.resp = '';
        return ret;
    }
};*/

var DIALOGUES_4A_BASIC = [

{
    query:  "[crazy]\tAbRA cAdaBra\n",
    response:
        "[crazy]/Host#loc~al.error\tbad msg format\n"+
        "[EOF]"
},

{
    query: "[usr~ssn]/Host#usr~ssn!time0+usr~ssn.on\t\n",
    response: "[usr~ssn]/Host#loc~al!00001+loc~al.on\t0\n"
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
    "[usr2~sn]/Host#usr2~sn!time1+usr2~sn.on\t\n",
    response:
    "[usr2~sn]/Host#loc~al!00002+loc~al.on\t0\n"
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


asyncTest('4.A basic cases', function(test){

    var storage = new Storage(db);
    var host = new Host('loc~al', 0, storage);
    host.clock = new TestClock(host.id);
    host.listen('bat:4A');

    var mux = new bat.BatMux('mux', 'bat:4A');

    var bt = new bat.StreamTest(mux.trunk, DIALOGUES_4A_BASIC, equal);

    bt.runScenario( start );

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
