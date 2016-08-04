"use strict";
//var LearnedComparator = require('./LearnedComparator');
var DiffMatchPatch = require('diff-match-patch');
var BatScript = require('./BatScript');

class StreamTest {

    constructor (script, stream, stream_factory) {
        this.ok = true;
        this.error = "";
        this.script = script;
        this.streams = new Map();
        this.openStream("default", stream);
        this.factory = stream_factory;
        this.dmp = new DiffMatchPatch();
        this.diff = null;
        this.output = null;
        this.current_round = 0;
        this.callback = null;
        this.results = [];
        this.input_time = 0;
        this.check_interval = setInterval(this.progressCheck.bind(this), 1000);
    }

    get running () {
        return this.check_interval!==null &&
            this.current_round<this.script.rounds.length;
    }

    roundElapsed () {
        return new Date().getTime() - this.input_time;
    }

    progressCheck () {
        if (!this.running) {
            clearInterval(this.check_interval);
        }
        var TOO_LONG = StreamTest.LONG_DELAY + 1000;
        if (this.roundElapsed() > TOO_LONG) {
            clearInterval(this.check_interval);
            this.ok = false;
            this.error = "test hangs";
            this.callback(this.results, this);
        }
    }

    run (callback) {
        if (this.callback!==null){
            throw new Error("test is running");
        }
        this.callback = callback;
        this.runRound();
    }

    runRound () {
        var round = this.script.rounds[this.current_round];
        var writes = Object.keys(round.input);
        writes.forEach(stream_id => {
                !this.streams[stream_id] && this.openStream(stream_id);
            });
        this.output = Object.create(null);
        writes.forEach(stream_id => this.output[stream_id] = "");
        writes.forEach(stream_id => {
            this.streams[stream_id].write(round.input[stream_id]);
        });
        this.input_time = new Date().getTime();
        setTimeout(this.checkOutput.bind(this), StreamTest.SHORT_DELAY);
    }

    openStream (stream_id, stream) {
        if (stream===undefined) {
            stream = this.factory.connect(stream_id);
        }
        this.streams[stream_id] = stream;
        stream.on("data", data => {
            this.output[stream_id] += data.toString();
        });
        stream.on("close", data => {
            this.output[stream_id] += "<\n";
        });
    }

    static normalize (output) {
        var norm = "";
        Object.keys(output).sort().map(id => norm += id+"<"+output[id]);
        return norm;
    }

    checkOutput () {
        var ok = this.compare().ok;
        if (!ok && this.roundElapsed()<StreamTest.LONG_DELAY) {
            setTimeout(this.checkOutput.bind(this), StreamTest.LONG_DELAY);
        } else {
            this.nextRound();
        }
    }

    compare () {
        var round = this.script.rounds[this.current_round];
        var result = {
            ok: true,
            diff: this.diff,
            input: round.input,
            expected: round.output,
            output: this.output
        };
        var expected_norm = BatScript.output2script
            (round.output, this.script.options);
        var output_norm = BatScript.output2script
            (this.output, this.script.options);
        var diff = this.dmp.diff_main(output_norm, expected_norm);
        result.ok = diff && diff.length===1 && diff[0][0]===0;
        result.diff = diff;
        result.comment = round.comment;
        return result;
    }

    nextRound () {
        var result = this.compare();
        this.results.push(result);
        this.current_round++;
        var rounds_left = this.script.rounds.length-this.current_round;
        if (rounds_left>0 && result.ok) {
            this.runRound();
        } else {
            clearInterval(this.check_interval);
            this.callback(this.results, this);
            this.callback = null;
        }
    }

}

StreamTest.SHORT_DELAY = 10;
StreamTest.LONG_DELAY = 250;

module.exports = StreamTest;