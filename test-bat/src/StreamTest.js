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
    this.compare = compare || cmp;
}

function cmp (act, exp) {
    return {
        ok: act===exp,
        actual: act,
        expected: exp
    };
}

module.exports = StreamTest;
StreamTest.default_interval = 100;

StreamTest.prototype.query = function (query, on_response) {
    var self = this;
    self.stream.write(query);
    setTimeout(function checkResponse() {
        var response = self.stream.read() || '';
        on_response(response.toString());
    }, StreamTest.default_interval);
};

StreamTest.prototype.runScenario = function ( callback ) {
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
    function done () {
        var ok = true;
        self.results.forEach(function(r){ ok &= r.ok; });
        callback(ok, self.results);
    }
};
