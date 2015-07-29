"use strict";
var LearnedComparator = require('./LearnedComparator');

// black box testing using a read-write stream
// API:
    // I. setup servers, loopback streams, the logix to test
    // II. new StreamTest(iostream, script);
    // III. stream_test.run();
function StreamTest (stream, scenario, compare) {
    this.stream = stream;
    stream.pause(); // TODO lc.try()
    this.scenario = scenario;
    this.results = [];
    this.lc = new LearnedComparator();
    this.turn_num = -1;
    this.busy = false;
    if (compare===undefined && typeof('equal')==='function') {
        compare = equal;
    }
    this.compare = compare || cmp;
}

function cmp (act, exp) {
    if (act===exp) {
        console.log('OK');
    } else {
        console.warn('FAIL', act, exp);
    }
}

module.exports = StreamTest;
StreamTest.default_interval = 100;

StreamTest.prototype.query = function (query, on_response) {
    var self = this;
    if (self.busy) {
        throw new Error('busy running a query');
    }
    self.stream.write(query);
    self.busy = true;
    setTimeout(function checkResponse() {
        self.busy = false;
        var response = self.stream.read() || '';
        on_response(response.toString());
    }, StreamTest.default_interval);
};

StreamTest.prototype.runScenario = function ( done ) {
    var turn = 0, self = this;
    next_query();
    function next_query () {
        var exchange = self.scenario[turn];
        var query = exchange.query;
        var expected_response = exchange.response;
        self.query(query, function onResponse (response) {
            var res = self.compare(response, expected_response);
            self.results.push(res);
            if (++turn===self.scenario.length) {
                done();
            } else {
                setTimeout(next_query, 1);
            }
        });
    }
};
