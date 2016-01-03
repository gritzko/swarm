"use strict";
var Op = require('./Op');
var Spec = require('./Spec');
var util         = require("util");
var OpSource = require('./OpSource');

/**
    Swarm subsystem interfaces are asynchronous and op-based: clients, storage,
    router, host - all consume op streams. To make all those part able to run
    remotely all the op (de)serialization logic is put behind a generic OpSource
    interface consisting of:
    (1) `handshake` and `op` (operation) events, also `error`, `end`
    (2) `write(op)` and `writeHandshake(op)` methods,
    (3) `end()` method.
    StreamOpSource runs on top of any regular byte stream (1st argument).
    On the outer side, StreamOpSource talks Swarm ops only.
    All arriving operations are marked with source id (options.peer_stamp or
    the stamp taken from the incoming handshake).

    Every op stream starts with a Swarm handshake, like:
    `/Swarm+Service#db+cluster!timestamp+user~session.on   {other:params}`.
    Handshake data is remembered as `peer_hs`.
    No ops can be received ahead of the incoming handshake. In case
    options.stamp and options.db_id are defined, our handshake is sent out
    immediately. Use opstream.writeHandshake(op) to send a handshake later on.
    NOTE: StreamOpSource posesses its underlying stream
    @constructor
    @param stream - the underlying byte stream
*/
function StreamOpSource (stream, options) {
    if (!stream || !stream.on) {
        throw new Error('no stream provided');
    }
    OpSource.call(this);
    this.stream = stream;
    this.options = options = options || {};
    this.pending_s = []; // FIXME this is not our business

    // Local session/database/timestamp
    // this.ssn_id = options.ssn_id || null;
    // this.db_id = options.db_id || null;
    // this.stamp = options.stamp || '0';
    // Peer session/database/timestamp
    this.mute = false;
    // unparsed bytes
    this.remainder = '';
    //
    this.flush_timeout = null;
    //this.serializer = options.serializer || LineBasedSerializer;
    if (options.keepAlive) {
        this.timer = setInterval(this.onTimer.bind(this), 1000);
    }
    this.stream.on('data', this.onStreamDataReceived.bind(this));
    this.stream.on('end', this.onStreamEnded.bind(this));
    this.stream.on('error', this.onStreamError.bind(this));
    //StreamOpSource.debug && console.log("StreamOpSource open", this.options);
    this.readable = false;
}
util.inherits(StreamOpSource, OpSource);
module.exports = StreamOpSource;
StreamOpSource.debug = false;
StreamOpSource.DEFAULT = new Spec('/Model!0.on');
StreamOpSource.SEND_DELAY_MS = 1;


StreamOpSource.prototype._write = function (op, callback) {
    this.pending_s.push( op.toString(StreamOpSource.DEFAULT) );
    if (this.asyncFlush) {
        var self = this;
        this.flush_timeout = this.flush_timeout || setTimeout(function(){
            self.flush_timeout = null;
            self.flush(callback);
        }, StreamOpSource.SEND_DELAY_MS);
    } else {
        this.flush(callback);
    }
};

StreamOpSource.prototype.send = StreamOpSource.prototype.write;
StreamOpSource.prototype.deliver = StreamOpSource.prototype.write;


StreamOpSource.prototype.flush = function (callback) {
    if (!this.stream) {return;}
    var parcel = this.pending_s.join('');
    this.pending_s = [];
    try {
        StreamOpSource.debug && console.log
            (this.peer_stamp||'unknown', '<', this.stamp||'undecided', parcel);
        this.stream.write(parcel, "utf8", callback);
        this.lastSendTime = new Date().getTime();
    } catch (ioex) {
        console.error(ioex, ioex.stack);
        this.onStreamError(ioex);
    }
};


StreamOpSource.prototype.isOpen = function () {
    return !!this.stream;
};


StreamOpSource.prototype._end = function (err_op, callback) {
    if (!this.stream) {
        console.warn(new Error('this op stream is not open').stack);
        return;
    }
    this.flush();
    var stream = this.stream;
    var err = err_op ? err_op.toString() : '';
    this.stream.end(err, "utf8", function () {
        stream.removeAllListeners(); // we possess the stream
        stream.destroy && stream.destroy();
        callback && callback();
    });
    this.stream = null;
};


StreamOpSource.prototype.onStreamDataReceived = function (data) {
    if (!this.stream) {
        return;
    }
    if (!data) {return;} // keep-alive

    this.remainder += data.toString();
    var parsed;

    try {

        // FIXME make ops in OpSource ?!!
        parsed = Op.parse(this.remainder, this.source(), StreamOpSource.DEFAULT);

    } catch (ex) {
        this.onStreamError(new Error('bad op format')); // FIXME fail prop
        return;
    }

    this.remainder = parsed.remainder;

    var ops = parsed.ops;

    try {

        if (!this.hs && ops.length) { // we expect a handshake
            var hs = ops.shift();
            if (OpSource.isHandshake(hs)) {
                this.emitHandshake(hs.spec, hs.value, hs.patch); // FIXME ugly
            } else {
                console.warn('not a handshake', hs.spec);
                this.emitError('not a handshake'); // FIXME make default?
                this.emitEnd();
                this.writeError('not a handshake');
                this.writeEnd();
                return;
            }
        }

        for(var i = 0; i < ops.length; i++) {
            this.emitOp(ops[i].spec, ops[i].value, ops[i].patch); // FIXME ugly
        }

    } catch (ex) {
        console.error(ex, ex.stack);
        this.onStreamError(ex);
    }
};


StreamOpSource.prototype._writeHandshake = StreamOpSource.prototype._write;


StreamOpSource.prototype.onStreamEnded = function () {
    this.emitEnd();
};


StreamOpSource.prototype.onStreamError = function (err) {
    StreamOpSource.debug && console.error('stream error', err.message, err.stack);
    if (this.stream) {
        this.emitError(err);
        // if (this.stream) {
        //     this.writeEnd( '.error', err );
        // }
    }
};


StreamOpSource.prototype.onTimer = function () {
    //if (!this.id && !this.closed) { FIXME move upstream (Router)
    //    this.close();
    //}    // health check
    // keepalive prevents the conn from being killed by overly smart middleboxes
    // and helps the server to keep track of who's really online
    if (this.options.keepAlive) {
        var time = new Date().getTime();
        var silentTime = time - this.lastSendTime;
        if (silentTime > (this.options.keepAliveInterval||50000)) {
            this.pending_s.push('\n');
            this.flush();
        }
    }
};


StreamOpSource.prototype.destroy = function () { // FIXME fail prop
    this._end();
    this.mute = true;
};


StreamOpSource.prototype.isOpen = function () {
    return !! this.stream;
};
