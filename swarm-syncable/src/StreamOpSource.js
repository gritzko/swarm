"use strict";
var Op = require('./Op');
var Spec = require('./Spec');
var util         = require("util");
var EventEmitter = require('eventemitter3');

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
    immediately. Use opstream.sendHandshake(op) to send a handshake later on.
    NOTE: StreamOpSource posesses its underlying stream
    @constructor
    @param stream - the underlying byte stream
*/
function StreamOpSource (stream, options) {
    if (!stream || !stream.on) {
        throw new Error('no stream provided');
    }
    EventEmitter.call(this, {objectMode: true});
    this.stream = stream;
    this.options = options = options || {};
    this.pending_s = []; // FIXME this is not our business

    // Local session/database/timestamp
    // this.ssn_id = options.ssn_id || null;
    // this.db_id = options.db_id || null;
    // this.stamp = options.stamp || '0';
    // Peer session/database/timestamp
    // this.peer_hs = null;
    this.source = options.source || null;
    this.mute = false;
    this.peer_hs = null; // peer handshake
    this.hs = null; // our handshake
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
util.inherits(StreamOpSource, EventEmitter);
module.exports = StreamOpSource;
StreamOpSource.debug = false;
StreamOpSource.DEFAULT = new Spec('/Model!0.on');
StreamOpSource.SEND_DELAY_MS = 1;


StreamOpSource.prototype.write = function (op, callback) {
    if (!this.hs) {
        this.hs = op;
    }
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
        console.error(ioex);
        this.onStreamError(ioex);
    }
};


StreamOpSource.prototype.isOpen = function () {
    return !!this.stream;
};


StreamOpSource.prototype.end = function (err_op, callback) {
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

        parsed = Op.parse(this.remainder, this.source, StreamOpSource.DEFAULT);

    } catch (ex) {
        this.onStreamError(new Error('bad op format'));
        return;
    }

    this.remainder = parsed.remainder;

    var ops = parsed.ops;

    try {

        if (!this.peer_hs && ops.length) { // we expect a handshake
             this.onHandshake(ops.shift());
        }

        for(var i = 0; i < ops.length; i++) {
            if (StreamOpSource.debug) {
                console.log(this.peer_hs.stamp()||'?', '>', this.hs.stamp()||'?', ops[i]);
            }
            this.emit('op', ops[i]);
        }

    } catch (ex) {
        console.error(ex);
        this.onStreamError(ex);
    }
};


StreamOpSource.prototype.writeHandshake = StreamOpSource.prototype.write;
StreamOpSource.prototype.sendHandshake = StreamOpSource.prototype.write;


StreamOpSource.prototype.onHandshake = function (op) {
    if (op.spec.pattern()!=='/#!.' || !/Swarm(\+.+)?/.test(op.spec.type()) ||
        op.op().toLowerCase()!=='on') {
        console.error('not a handshake:', op);
        this.onStreamError(new Error('invalid handshake'));
    } else {
        this.peer_hs = op;
        this.emit('handshake', op);
    }
};


StreamOpSource.prototype.onStreamEnded = function () {
    this.emit('end', this);
};


StreamOpSource.prototype.onStreamError = function (err) {
    StreamOpSource.debug && console.error('stream error', err.message, err.stack);
    if (this.stream) {
        this.emit('error', err);
        if (this.stream) {
            this.end( '.error\t' + err + '\n' );
        }
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


StreamOpSource.prototype.destroy = function () {
    this.end();
    this.mute = true;
};
