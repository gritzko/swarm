"use strict";
var LearnedComparator = require('./LearnedComparator');
var BatMux = require('./BatMux');

// black box testing using a read-write stream
// API:
    // I. setup servers, loopback streams, the logix to test
    // II. new StreamTest(iostream, script);
    // III. stream_test.run();
function StreamTest (stream, scenario, compare, normalize) {
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
    this.normalize = normalize || same;
}

function cmp (act, exp) {
    if (act===exp) {
        console.log('OK');
    } else {
        console.warn('FAIL', act, exp);
    }
}

function same (a) {
    return a;
}

StreamTest.collapse_spaces = function (a) {
    return a.replace(/[\t\s]+/g, ' ');
}

module.exports = StreamTest;
StreamTest.default_interval = 25;
StreamTest.default_attempts = 40;

StreamTest.prototype.query = function (query, on_response, hint) {
    var self = this;
    if (self.busy) {
        throw new Error('busy running a query');
    }
    self.stream.write(query);
    self.busy = query;
    var response = '';
    var attempts = 0;
    var normalize = this.normalize;
    function checkResponse() {
        self.busy = null;
        var new_response = self.stream.read() || '';
        response += new_response;
        if (normalize(response)===normalize(hint) || ++attempts>=StreamTest.default_attempts) {
            clearInterval(interval);
            if (self.mux) {
                self.mux.clearTag();
            }
            on_response(response);
        }
    }
    var interval = setInterval(checkResponse, StreamTest.default_interval);
};

StreamTest.prototype.run = function ( done ) {
    var turn = 0, self = this;
    next_query();
    var normalize = this.normalize;
    function next_query () {
        var exchange = self.scenario[turn];
        var query = exchange.query;
        var expected_response = exchange.response;
        self.query(query, function onResponse (response) {
            var res = self.compare(normalize(response), normalize(expected_response), exchange.comment);
            self.results.push(res);
            if (++turn===self.scenario.length) {
                done && done();
            } else {
                setTimeout(next_query, 1);
                // TODO setInterval is possibly better
            }
        }, expected_response);
    }
};


StreamTest.prototype.runScenario = StreamTest.prototype.run;
