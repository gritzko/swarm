"use strict";
var bat = require('..');
var LearnedComparator = bat.LearnedComparator;
var BatServer = bat.BatServer;
var BatMux = bat.BatMux;
var BatStream = bat.BatStream;
var StreamTest = bat.StreamTest;
var url = require('url');

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}

var positives = [

	{
		expected: "$NAME was beginning to get very tired of sitting"+
				  " by her ${SIBLING} on the bank",
		fact:     "Alice was beginning to get very tired of sitting"+
		          " by her sister on the bank"
	},

	{
		expected: "${COLOR} ${RODENT} with pink eyes ran close by her",
		fact:     "White Rabbit with pink eyes ran close by her"
	},

	{
		expected: "$*'${LABEL/([A-Z ]+)/}'$*",
		fact:     "and round the neck of the bottle was a paper"+
				  " label, with the words 'DRINK ME' beautifully "+
				  "printed on it in large letters"
	},

	{
		expected: "$RODENT's little white kid gloves",
		fact:     "Rabbit's little white kid gloves"
	},

	{
		expected: "So $NAME began telling them her adventures from"+
				  " the time when she first saw the $COLOR $RODENT",
		fact:     "So Alice began telling them her adventures from"+
				  " the time when she first saw the White Rabbit"
	},

	{
		expected: "Behead that $RODENT2!",
		fact:     "Behead that Dormouse!"
	},

	{
		expected: "'The trial cannot proceed,' said the "+
				  "${MONARCH/King|Queen/}"+
				  " in a very grave voice",
		fact:     "'The trial cannot proceed,' said the King in a "+
		          "very grave voice"
	},

	{
		expected: "{${RODENT}}",
		fact:     "{Rabbit}"
	},

	{
		expected: "${RODENT",
		fact:     "${RODENT"
	},

	{
		expected: "$RODENT}",
		fact:     "Rabbit}"
	}

];

var negatives = [
	{
		expected: "So $NAME began telling them her adventures from"+
				  " the time when she first saw the $COLOR $RODENT",
		fact:     "So Alice began telling them her adventures from"+
				  " the time when she first saw the White Hare"
	},

	{
		expected: "So $NAME began telling them her adventures from"+
				  " the time when she first saw the $COLOR $RODENT",
		fact:     "So Alice began telling them her adventures from"+
				  " the time when she first saw the WhiteRabbit"
	},

	{
		expected: "Behead that $RODENT!",
		fact:     "Behead that Dormouse!"
	}

];

var variables = {
	NAME: "Alice",
	SIBLING: "sister",
	COLOR: "White",
	RODENT: "Rabbit",
	LABEL: "DRINK ME",
	RODENT2: "Dormouse",
	MONARCH: "King"
};

tape.skip ('2.a. LearnedComparator', function (t) {
    var lc = new LearnedComparator();
    positives.forEach(function (sc) {
        t.equal(sc.fact, sc.expected);
    });
    negatives.forEach(function (sc) {
        t.equal(sc.fact, sc.expected);
    });
    for(var key in variables) {
    	t.equal(lc.variables[key], variables[key], key);
    }
});

tape ('2.b. BatStream', function (t) {
	var stream = new BatStream();
    var date = new Date().toString();
	stream.on('data', function(data) {
		var str = data.toString();
		t.equal(str, date, 'loopback stream');
        t.end();
	});
	stream.pair.write(date);
});

tape ('2.c. BatServer', function (t) {
	var step = 1, count = 3;
    t.plan(count);
	var server = new BatServer('srv1');
	server.on('connection', function (in_stream) {
		in_stream.on('data', function (data) {
			var int = parseInt(data.toString());
			t.equal(int, step, 'stream #'+(step++));
            if (step>count) { t.end(); }
		});
	});
	var stream = new BatStream();

	stream.connect('srv1', null, function (error, stream) {
    for (var i=step; i<=count; i++) {
      stream.write(''+i);
    }
  });
});

tape ('2.d. BatMux', function (t) {
	var srv2 = new BatServer('srv2');
	var mux = new BatMux('mux1');
	var response = '';
	var stream_count = 0;
    mux.on('error', function(err){
        console.error('mux error', err);
        t.fail();
        t.end();
    });
	srv2.on('connection', function (stream) {
		var stream_no = ++stream_count;
		stream.on('data', function (in_data) {
			var out_data = in_data.toString().
				replace(/./g, ''+stream_no);
			stream.write(out_data);
		});
        stream.on('end', function () {
            stream.end();
        });
	});
	mux.trunk.on('data', function (data) {
		response += data.toString();
	});
    mux.trunk.on('end', function (data) {
        t.equal(
            response,
            '[loopback:srv2#A]111[loopback:srv2#B]222'+
            '[loopback:srv2#A][EOF][loopback:srv2#B][EOF]',
            'mux/demux and stream end events');
        t.end();
    });
	mux.trunk.write('[loopback:srv2#A]one[loopback:srv2#B]');
    mux.trunk.write('two');
    mux.trunk.end();
});

tape ('2.e. Black box', function (t) {
	var responder = new BatStream();
	responder.on('data', function(data) {
		var str = data.toString();
		var int = parseInt(str);
		responder.write(''+(int<<1));
	});
	var requester = responder.pair;
	var test = new StreamTest(requester,
        [ {'query':'1', 'response': '2'},
	      {'query':'12', 'response': '24'} ],
        t.equal.bind(t)
    );
	test.runScenario( function (ok, results) {

		test.query('3', function(response){
			t.equal(response, '6', 'manual step');
            t.end();
		});

	} );
});
