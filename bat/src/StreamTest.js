"use strict";
var LearnedComparator = require('./LearnedComparator');

// black box testing using a read-write stream 
// API:
	// I. setup servers, loopback streams, the logix to test
	// II. new StreamTest(iostream, script);
	// III. stream_test.run();
function StreamTest (stream, scenario) {
	this.stream = stream;
	this.scenario = scenario;
	this.results = [];
	this.lc = new LearnedComparator();
	this.turn_num = 0;
}

module.exports = StreamTest;

StreamTest.prototype.turn = function (){
	var self = this;
	if (this.turn_num>=0) {
		var response = self.stream.read();
		var compare = self.lc.compare
				(self.scenario[this.turn_num].response, response);
		this.results.push(compare);
		ok &= compare.ok;
	}
	if (++this.turn_num<this.scenario.length) {
		var query = self.scenario[this.turn_num].query;
		self.stream.write(query);
		return true;
	}
	return false;
};

StreamTest.prototype.run = function ( callback ) {
	var self = this;
	var interval = setInterval(function () {
		if (!self.turn()) {
		    clearInterval(interval);
		    var ok = true;
		    self.results.forEach(function(r){ ok &= r.ok; });
		    callback(ok, self.results);
		}
	});
};

