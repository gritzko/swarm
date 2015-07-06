"use strict";



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

function log (ok, title, value) {
	if (ok) {
		console.log("OK", title.substr(0,80));
	} else {
		console.warn("FAIL", title.substr(0,80), value);
	}
	if (dom_log) {
		var record = window.document.createElement('P');
		record.setAttribute('class', 'test ' + (ok ? 'ok' : 'fail') ) ;
		record.innerHTML = '<b>' + (ok ? 'OK' : 'FAIL') +
			'</b> <i>' + title + '</i> <tt>' + (ok?'':value) + '</tt>';
		dom_log.appendChild(record);
	}
}

function test_lc () {
    var lc = new LearnedComparator();
    positives.forEach(function (sc) {
        var ret = lc.compare(sc.fact, sc.expected);
        log(ret.ok, sc.expected, ret);
    });
    negatives.forEach(function (sc) {
        var ret = lc.compare(sc.fact, sc.expected);
        log(!ret.ok, sc.expected, ret);
    });
    for(var key in variables) {
    	log(variables[key]===lc.variables[key], key, lc.variables[key]);
    }

}

function test_bat_stream () {
	var stream = new BatStream();
	stream.on('data', function(data) {
		var str = data.toString();
		log(str==='data', 'loopback stream', data);
	});
	stream.pair.write('data');
}

function test_bat_server () {
	var step = 1;
	var server = new BatServer('bat:srv1');
	server.on('connection', function (in_stream) {
		in_stream.on('data', function (data) {
			var int = parseInt(data.toString());
			log(int===step, 'stream #'+step, data);
		});
	});
	var stream = new BatStream();
	stream.connect('srv1');
	stream.write(''+step);
	stream.write(''+(++step));
	stream.write(''+(++step));
}

function test_bat_mux () {
	var srv2 = new BatServer('srv2');
	var mux = new BatMux('mux1', 'srv2');
	var response = '';
	var stream_count = 0;
	srv2.on('connection', function (stream) {
		var stream_no = ++stream_count;
		stream.on('data', function (in_data) {
			var out_data = in_data.toString().
				replace(/./g, ''+stream_no);
			stream.write(out_data);
		});
	});
	mux.trunk.on('data', function (data) {
		response += data.toString();
	});
	mux.trunk.write('[stream1]one[stream2]');
	mux.trunk.write('two');
	log(response==='[stream1]111[stream2]222', 'mux/demux', response);
}

function run_tests () {
	test_bat_stream();
	test_bat_server();
	test_bat_mux();
	test_lc();
}

// isomorphic, yeah

if (typeof(require)==='function') {
	var LearnedComparator = require('../src/LearnedComparator');
	var BatStream = require('../src/BatStream');
	var BatServer = require('../src/BatServer');
	var BatMux = require('../src/BatMux');
}

if (typeof(document)==='object') {
	var dom_log = window.document.createElement('DIV');
	window.onload = function () {
		window.document.body.appendChild(dom_log);
		run_tests();
	};
} else {
	run_tests();
}
