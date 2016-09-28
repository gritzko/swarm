"use strict";
const BatResult = require('./BatResult');
const su = require('stream-url');


class StreamTest {

    /**
     *  @param {BatScript} script
     *  @param {Object|String} options - run mode options:
     *      connect, listen, stream
     * */
    constructor (script, options) {
        if (!options)
            options = Object.create(null);
        else if (options.constructor===String)
            options = {connect: options};
        this.options = options;
        this.script = script;
        this.round_i = -1;
        this.round = null;
        this.streams = new Map();
        this.error = null;
        this.output = Object.create(null);
        this.callback = null;
        this.results = [];
        this.input_time = 0;
        this.check_interval = null;
        this._listen_for_id = null;
        const defstr = options.default;
        if (defstr) {
            this._add_stream (defstr, 'default');
        }
        options.listen && su.listen(options.listen, (err, server) => {
            if (err) return this._finish(err);
            server.on('connection', stream => {
                if (this._listen_for_id)
                    this._add_stream(stream, this._listen_for_id);
                else
                    this._finish('unexpected incoming connection');
            } );
        });
    }

    get running () {
        return this.check_interval!==null &&
            this.round_i<this.script.rounds.length;
    }

    roundElapsed () {
        return new Date().getTime() - this.input_time;
    }

    /** invoked by: timer */
    _progressCheck () {
        var TOO_LONG = StreamTest.LONG_DELAY;
        if (this.roundElapsed() < TOO_LONG) return;
        this._check_output(true);
    }

    /** invoked by: API user */
    run (callback) {
        if (this.check_interval!==null){
            throw new Error("test is running");
        }
        this.check_interval = setInterval(this._progressCheck.bind(this), 100);
        this.callback = callback;
        setImmediate(this._next_round.bind(this));
    }

    _finish (err) {
        this.error = err;
        clearInterval(this.check_interval);
        this.streams.forEach(stream => stream.end());
        this.callback(this.results, this);
    }

    /** invoked by: run, _open_stream, _check_output */
    _run_round () {
        const not_open = this.script.streams.find(id => !this.streams.has(id));
        if (not_open) { // missing a stream
            if (this.options.listen)
                this._listen_for_id = not_open;
            else
                this._connect_stream(not_open);
        } else { // all streams ready
            Object.keys(this.round.output).forEach(
                id => this.output[id] = ""
            );
            //console.warn('WROTE', this.round.input);
            Object.keys(this.round.input).forEach(
                id => this.streams.get(id).write(this.round.input[id])
            );
            this.input_time = new Date().getTime();
        }
    }

    _connect_stream (stream_id) {
        su.connect (this.options.connect, (err, stream) => {
            if (err) {
                this._finish(err);
            } else {
                this._add_stream(stream, stream_id);
                this._run_round();
            }
        });

    }

    _add_stream (stream, stream_id) {
        this.streams.set(stream_id, stream);
        stream.on("data", data => {
            //console.warn('GOT',stream_id, data.toString());
            this.output[stream_id] += data.toString();
            this._check_output(false);
        });
    }

    _next_round (result) {
        this.round = this.script.rounds[++this.round_i];
        this._run_round();
    }

    _check_output (force) {
        var result = new BatResult (this.round, this.output, this.script.options);
        if (result.ok || force) {
            this.results.push(result);
            this.output = Object.create(null);
            this.round = null;
            if (this.round_i+1<this.script.rounds.length && (result.ok || this.options.runAll)) {
                this._next_round();
            } else {
                this._finish();
            }
        }
    }

}

StreamTest.SHORT_DELAY = 10;
StreamTest.LONG_DELAY = 250;

module.exports = StreamTest;