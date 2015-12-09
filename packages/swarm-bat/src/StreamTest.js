"use strict";
var LearnedComparator = require('./LearnedComparator');
var BatMux = require('./BatMux');

// black box testing using a read-write stream
// API:
    // I. setup servers, loopback streams, the logix to test
    // II. new StreamTest(iostream, script);
    // III. stream_test.run();
function StreamTest (stream, scenario, compare) {
    if (stream.constructor===BatMux) {
        this.mux = stream;
        stream = stream.trunk;
    } else {
        this.mux = null;
    }
    this.stream = stream;
    stream.pause(); // TODO lc.try()
    this.scenario = scenario;
    this.results = [];
    this.lc = new LearnedComparator();
    this.turn_num = -1;
    this.busy = false;
    // sometimes 'equal' is a global
    this.compare = compare || equal || cmp;
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
    self.busy = query;
    setTimeout(function checkResponse() {
        self.busy = null;
        var response = self.stream.read() || '';
        if (self.mux) {
            self.mux.clearTag();
        }
        on_response(response.toString());
    }, StreamTest.default_interval);
};

StreamTest.prototype.run = function ( done ) {
    var turn = 0, self = this;
    next_query();
    function next_query () {
        var exchange = self.scenario[turn];
        var query = exchange.query;
        var expected_response = exchange.response;
        self.query(query, function onResponse (response) {
            var res = self.compare(response, expected_response, exchange.comment);
            self.results.push(res);
            if (++turn===self.scenario.length) {
                done && done();
            } else {
                setTimeout(next_query, 1);
                // TODO setInterval is possibly better
            }
        });
    }
};


StreamTest.prototype.runScenario = StreamTest.prototype.run;
