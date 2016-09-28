"use strict";
const BatResult = require('./BatResult');
const su = require('stream-url');


class StreamTest {

    /**
     *  @param {BatScript} script
     *  @param {Object|String} options - run mode options:
     *      stream, server, connect, runAll
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
        this.results = [];
        this.input_time = 0;
        this.check_interval = null;
        this._listen_for_id = null;
        this._pending_conns = [];
        if (options.stream)
            this.addStream (options.stream, 'default');
        if (options.server)
            options.server.on('connection', this._accept_connection.bind(this));
    }

    _accept_connection (stream) {
        StreamTest.debug && console.warn('ACCEPT');
        if (this._listen_for_id)
            this.addStream(stream, this._listen_for_id);
        else
            this._pending_conns.push(stream);
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
        StreamTest.debug && console.warn('TIME!');
        this._check_output(true);
    }

    /** invoked by: API user */
    run (callback) {
        if (this.check_interval!==null){
            throw new Error("test is running");
        }
        this.check_interval = setInterval(this._progressCheck.bind(this), 100);
        this.options.callback = callback;
        this.input_time = new Date().getTime();
        setImmediate(this._next_round.bind(this));
    }

    _finish (err) {
        this.error = err;
        if (this.check_interval)
            clearInterval(this.check_interval);
        this.streams.forEach(stream => stream.end());
        this.options.callback(err, this.results, this);
    }

    /** invoked by: run, _open_stream, _check_output */
    _run_round () {
        const not_open = this.script.streams.find(id => !this.streams.has(id));
        if (not_open) { // missing a stream
            if (this.options.server) {
                if (this._pending_conns.length)
                    this.addStream(this._pending_conns.shift(), not_open);
                else
                    this._listen_for_id = not_open; // TODO []
            } else {
                this._connect_stream(not_open);
            }
        } else { // all streams ready
            StreamTest.debug && console.warn('WROTE', this.round.input);
            Object.keys(this.round.input).forEach(
                id => this.streams.get(id).write(this.round.input[id])
            );
            this.input_time = new Date().getTime();
        }
    }

    _connect_stream (stream_id) {
        StreamTest.debug && console.warn('CONNECTING');
        if (!this.options.url) {
            return this._finish("no connect url");
        }
        su.connect (this.options.url, (err, stream) => {
            if (err) {
                this._finish(err);
            } else {
                this.addStream(stream, stream_id);
                this._run_round();
            }
        });

    }

    addStream (stream, stream_id) {
        this.streams.set(stream_id, stream);
        stream.on("data", data => {
            StreamTest.debug && console.warn('GOT',stream_id, data.toString());
            if (this.output[stream_id]===undefined)
                this.output[stream_id] = '';
            this.output[stream_id] += data.toString();
            this._check_output(false);
        });
    }

    _next_round (result) {
        StreamTest.debug && console.warn('NEXT_ROUND');
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
StreamTest.LONG_DELAY = 500;
StreamTest.debug = false;
module.exports = StreamTest;