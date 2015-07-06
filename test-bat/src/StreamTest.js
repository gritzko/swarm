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
    this.compare = compare;
}

module.exports = StreamTest;

StreamTest.prototype.turn = function (){
    var self = this;
    if (this.turn_num>=0) {
        var response = self.stream.read() || '';
        this.compare(response.toString(), self.scenario[this.turn_num].response);
        /*var compare = self.lc.compare
                (response, self.scenario[this.turn_num].response);
        this.results.push(compare);
        if (!compare.ok) {
            console.warn(QUnit.diff(response, self.scenario[this.turn_num].response));
            console.warn(
                'MATCH\t', compare.matched, '\n',
                'EXPCT\t', compare.expected, '\n',
                'FACTL\t', compare.fact);
        }*/
    }
    if (++this.turn_num<this.scenario.length) {
        var query = self.scenario[this.turn_num].query;
        self.stream.write(query);
    }
};

StreamTest.prototype.run = function ( callback ) {
    var self = this;
    var interval = setInterval(function () {
        try{
            self.turn();
        } catch (ex) {
            console.error(ex.message, ex.stack);
        }
        if (self.turn_num===self.scenario.length) {
            clearInterval(interval);
            var ok = true;
            self.results.forEach(function(r){ ok &= r.ok; });
            callback(ok, self.results);
        }
    }, 100);
};
