"use strict";
var Op = require('./Op');
var util         = require("util");
var EventEmitter = require("events").EventEmitter;

// Swarm subsystem interfaces are asynchronous and op-based: clients, storage,
// router, host - all consume op streams. To make all those part able to run
// remotely all the op serialization logic is put into a generic OpStream.
// OpStream runs on top of any regular byte stream (1st argument).
// On the outer side, OpStream talks Swarm ops only.
// All arriving operations are marked with source id (options.peer_stamp).
//
// Every OpStream starts with a Swarm handshake, like:
//  `/Swarm+Service#db+cluster!timestamp+user~session.on   {other:params}`.
// Apart from regular 'data', 'end' and 'error' events, OpStream emits
// a special handshake event 'id' once incoming handshake is received.
// Handshake data is remembered as `peer_ssn_id`, `peer_db_id`, `peer_options`,
// `peer_stamp`. No ops can be received ahead of the incoming
// handshake.
// In case options.stamp and options.db_id are defined, our handshake is
// sent out immediately. Use opstream.sendHandshake(op) to send
// a handshake later on.
//
// options object:
function OpStream (stream, options) {
    EventEmitter.call(this);
    if (!stream || !stream.on) {
        throw new Error('no stream provided');
    }
    this.stream = stream;
    this.options = options = options || {};
    this.pending_s = [];
    this.ssn_id = options.ssn_id || null;
    this.db_id = options.db_id || null;
    this.stamp = options.stamp || '0';
    this.peer_ssn_id = null;
    this.peer_db_id = null;
    this.peer_options = null;
    this.peer_stamp = null;
    this.remainder = '';
    this.bound_flush = this.flush.bind(this);
    this.lastSendTime = 0;
    //this.serializer = options.serializer || LineBasedSerializer;
    if (options.keepAlive) {
        this.timer = setInterval(this.onTimer.bind(this), 1000);
    }
    this.stream.on('data', this.onStreamDataReceived.bind(this));
    this.stream.on('end', this.onStreamClosed.bind(this));
    this.stream.on('error', this.onStreamError.bind(this));
    options.maxSendFreq;
    options.burstWaitTime;
    //OpStream.debug && console.log("OpStream open", this.options);
}
util.inherits(OpStream, EventEmitter);
module.exports = OpStream;
OpStream.debug = false;

OpStream.prototype.write = function (op) {
    this.pending_s.push(op);
    if (this.asyncFlush) {
        if (!this.flush_timeout) {
            var delay;
            this.flush_timeout = setTimeout(this.bound_flush, delay);
        }
    } else {
        this.flush();
    }
};
OpStream.prototype.deliver = OpStream.prototype.send = OpStream.prototype.write;

OpStream.prototype.flush = function () {
    if (!this.stream) {return;}
    var parcel = this.pending_s.join('');
    this.pending_s = [];
    try {
        OpStream.debug && console.log
            (this.peer_stamp||'unknown', '<', this.stamp||'undecided', parcel);
        this.stream.write(parcel);
        this.lastSendTime = new Date().getTime();
    } catch(ioex) {
        console.error(ioex.message, ioex.stack);
        this.close();
    }
};

OpStream.prototype.end = function (something) {
    if (!this.stream) {
        throw new Error('this op stream is not open');
    }
    if (something) {
        this.write(something);
    }
    this.stream.end();
    this.stream = null;
};


OpStream.prototype.onStreamDataReceived = function (data) {
    if (this.closed) {
        throw new Error('the OpStream is closed');
    }
    if (!data) {return;} // keep-alive

    this.remainder += data.toString();

    var parsed;

    try {

        parsed = Op.parse(this.remainder, this.peer_stamp, this.context);

    } catch (ex) {
        console.error(ex.message, ex.stack);
        this.emit('error', 'bad op format');
        this.close(); // crude DDoS protection TODO
        return;
    }

    this.remainder = parsed.remainder;
    var ops = parsed.ops;

    if (!ops || !ops.length) {
        return;
    }

    try {

        if (!this.peer_stamp) { // we expect a handshake
            this.onHandshake(ops.shift());
        }

        OpStream.debug && console.log
            (this.peer_stamp||'unknown', '>', this.stamp||'undecided', data.toString());

        var author = this.options.restrictAuthor || undefined;
        for(var i=0; i<ops.length; i++) {
            var op = ops[i];
            if (author!==undefined && op.spec.author()!==author) {
                throw new Error('access violation: '+op.spec);
            }
            this.emit('data', op);
        }

    } catch (ex) {
        console.error('processing error', ex.message, ex.stack);
        this.emit("error", "processing error");
        this.close();
    }

};

OpStream.prototype.sendHandshake = function (op) {
    if (op.spec.pattern()!=='/#!.' || !/Swarm(\+.+)?/.test(op.spec.type()) ||
        op.op().toLowerCase()!=='on') {
        throw new Error('not a handshake');
    }
    this.db_id = op.id();
    this.ssn_id = op.origin();
    this.stamp = op.stamp();
    this.write(op);
};

OpStream.prototype.onHandshake = function (op) {
    if (op.spec.pattern()!=='/#!.' || !/Swarm(\+.+)?/.test(op.spec.type()) ||
        op.op().toLowerCase()!=='on') {
        console.error('not a handshake:', op);
        this.stream.end();
        this.stream = null;
        this.emit('error', 'invalid handshake: ');
        return;
    }
    this.peer_db_id = op.id();
    this.peer_ssn_id = op.origin();
    this.peer_options = op.value ? JSON.parse(op.value) : null;
    this.peer_stamp = op.stamp();
    this.emit('id', op, this);
};

OpStream.prototype.onStreamClosed = function () {
    this.stream = null;
    this.emit('close');
};

OpStream.prototype.onStreamError = function (err) {
    OpStream.debug && console.error('stream error', this.source_id, err);
    this.emit('error', err);
    if (this.stream) {
        this.end();
    }
};

OpStream.prototype.onTimer = function () {
    //if (!this.id && !this.closed) { FIXME move upstream (Router)
    //    this.close();
    //}    // health check
    // keepalive prevents the conn from being killed by overly smart middleboxes
    // and helps the server to keep track of who's really online
    if (this.options.keepAlive) {
        var time = new Date().getTime();
        var silentTime = time - this.lastSendTime;
        if (silentTime > (this.options.keepAliveInterval||50000)) {
            this.flush();
        }
    }
};

OpStream.prototype.close = function () {
    if (this.stream) {
        this.stream.end();
    }
    this.stream = null;
};

/*function snippet (o) {
    return (o||'<empty>').toString().replace(/\n/g,'\\n').substr(0,50);
}*/
