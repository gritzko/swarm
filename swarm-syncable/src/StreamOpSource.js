"use strict";
// var Op = require('./Op');
var Spec = require('./Spec');
var util         = require("util");
var OpSource = require('./OpSource');
var Op = require('./Op');

/**
 *  Swarm subsystem interfaces are asynchronous and op-based: clients, storage,
 *  router, host - all consume op streams. To make all those part able to run
 *  remotely all the op (de)serialization logic is put behind a generic OpSource
 *  interface consisting of:

 *  * Three events:
 *      * `handshake` (stream starts, tells the db id and the ssn id),
 *      * `op` (operation, both CRDT ops and pub-sub pseudo-ops), and
 *      * `end` (stream ended, no more ops will be emitted).
 *  * and three matching methods:
 *      * `writeHandshake(op)`,
 *      * `writeOp(op)`, and
 *      * `writeEnd(err)`.
 *
 *  StreamOpSource runs on top of any regular byte stream (1st argument).
 *  On the outer side, StreamOpSource talks Swarm ops only.
 *  All arriving operations are marked with source id (options.peer_stamp or
 *  the stamp taken from the incoming handshake).
 *
 *  Every op stream starts with a Swarm handshake, like:
 *  `/Swarm+Service#db+cluster!timestamp+user~session.on   {other:params}`.
 *  Handshake data is remembered as `peer_hs`.
 *  No ops can be received ahead of the incoming handshake. In case
 *  options.stamp and options.db_id are defined, our handshake is sent out
 *  immediately. Use opstream.writeHandshake(op) to send a handshake later on.
 *  NOTE: StreamOpSource posesses its underlying stream
 *  @constructor
 *  @param stream - the underlying byte stream
 *  @implements {OpSource}
 */
function StreamOpSource (stream, options) {
    if (!stream || !stream.on) {
        throw new Error('no stream provided');
    }
    OpSource.call(this);
    this.stream = stream;
    this.options = options = options || {};
    this.pending_ops = [];

    this.mute = false;
    // unparsed bytes
    this.buf = null;
    this.lines = [];
    //
    this.flush_timeout = null;
    //this.serializer = options.serializer || LineBasedSerializer;
    if (options.keepAlive) {
        this.timer = setInterval(this.onTimer.bind(this), 1000);
    }
    var self = this;
    this.dataListener = this.onStreamDataReceived.bind(this);
    this.endListener = this.onStreamEnded.bind(this);
    this.errorListener = this.onStreamFailure.bind(this);

    this.stream.on('data', this.dataListener);
    this.stream.on('end', this.endListener);
    this.stream.on('error', this.errorListener);

    //StreamOpSource.debug && console.log("StreamOpSource open", this.options);
    this.readable = false;
}
util.inherits(StreamOpSource, OpSource);
module.exports = StreamOpSource;
/** The most accurate way of debugging Swarm internals is to log all
  * ins and outs of every OpSource  */
StreamOpSource.debug = false;
StreamOpSource.SEND_DELAY_MS = 10;
StreamOpSource.SYNC_FLUSH = false;


StreamOpSource.prototype.removeStreamListeners = function () {
    if (!this.stream) { return; }

    this.stream.removeListener('data', this.dataListener);
    this.stream.removeListener('end', this.endListener);
    this.stream.removeListener('error', this.errorListener);
    this.stream = null;
};

StreamOpSource.prototype._writeOp = function (op, callback) {
    this.pending_ops.push( op );
    this.scheduleFlush(callback);
};


StreamOpSource.prototype._writeHandshake = function (hs, callback) {
    this._actually_send(hs.toString()+'\n\n', callback);
};


StreamOpSource.prototype.send = StreamOpSource.prototype.write;
StreamOpSource.prototype.deliver = StreamOpSource.prototype.write;


StreamOpSource.prototype.scheduleFlush = function (callback, flush) {
    if (this.options.syncFlush || StreamOpSource.SYNC_FLUSH) {
        return this.flush(callback);
    }
    var self = this;
    this.flush_timeout = this.flush_timeout || setTimeout(function(){
        self.flush_timeout = null;
        self.flush(callback);
    }, StreamOpSource.SEND_DELAY_MS);
};


StreamOpSource.prototype.flush = function (callback) {
    if (!this.stream) {return;}
    var p_o = this.pending_ops;
    if (!p_o.length) { return; }
    var parcel = '', def = this.default;
    p_o.forEach(function(op){
        parcel += op.toString(def)+'\n';
    });
    if (p_o[p_o.length-1].op()==='on') {
        parcel += '\n'; // terminate the .on
    }
    p_o.length = 0;
    this._actually_send(parcel, callback);
};

StreamOpSource.prototype._actually_send = function (parcel, callback) {
    try {
        StreamOpSource.debug && console.warn('SOPS_SEND', parcel);
        this.stream.write(parcel, "utf8", callback);
        this.lastSendTime = new Date().getTime();
    } catch (ioex) {
        console.error(ioex, ioex.stack);
        this.onStreamFailure(ioex);
    }
};


StreamOpSource.prototype.isOpen = function () {
    return !!this.stream;
};


StreamOpSource.prototype._writeEnd = function (err_op) {
    if (!this.stream) {
        StreamOpSource.debug && console.warn("SOPS_REPEAT_END");
        return;
    }
    StreamOpSource.debug && console.warn("SOPS_END", err_op.toString());
    if (!err_op || err_op.constructor===String) {
        err_op = new Op(this.hs.spec.set('.off'), err_op||'');
    }
    this.pending_ops.push(err_op);
    this.flush();
    var stream = this.stream;
    this.stream = null;
    try{
        stream.end(null, "utf8", function () {
        });
    } catch (ex) {
        console.error(ex.stack);
    }
};

StreamOpSource.prototype.onStreamDataReceived = function (new_read_buf) {
    StreamOpSource.debug && console.warn('SOPS_RECV', new_read_buf.toString());
    try{
        this._parseIncomingBuf(new_read_buf);
    } catch (ex) {
        console.warn('stream parse failed', ex.stack);
        this.onStreamFailure('error processing data');
    }
};

// Does rough parsing for serialized ops (it is possible that the last op
// is interrupted midway, even in the middle of a Unicode char.
// Passes results to OpSource emit methods.
StreamOpSource.prototype._parseIncomingBuf = function (new_read_buf) {
    if (this.buf && this.buf.length) {
        this.buf = Buffer.concat([this.buf, new_read_buf]);
    } else {
        this.buf = new_read_buf;
    }
    // captures: 1 indent 2 key 3 value
    var sol=0, eol=-1;
    while ( 0 <= (eol=this.buf.indexOf(10, sol)) ) {
        var line = this.buf.toString('utf8', sol, eol);
        var m = StreamOpSource.rough_line_re.exec(line);
        if (!m) {
            //StreamOpSource.debug &&
            console.warn('unparseable: '+line);
            throw new Error('unparseable input');
        } else {
            this.lines.push(m);
        }
        sol = eol+1;
    }
    this.buf = sol===this.buf.length ? null : this.buf.slice(sol);

    if (!this.lines.length) {
        return;
    }

    if (this.lines[0][1]) { // first line is indented
        throw new Error('nested op with no parent op');
    }

    var last = this.lines.length-1;
    while (last>0 && this.lines[last][1]) {
        last--;
    }
    if (last===this.lines.length-1) {
        var spec = new Spec(this.lines[last][2], null, OpSource.DEFAULT);
        if (spec.op()!=='on') {
            last++;
        }
    }

    this.eatLines(last);
};

StreamOpSource.prototype.eatLines = function (till) {
    for(var i=0; i<till; i++)  {
        var pline = this.lines[i], key = pline[2], value = pline[3];
        if (!key) { continue; } // blank line FIXME end patch
        var patch = [];
        for(var j=i+1; j<till && this.lines[j][1]; j++) {
            var pl = this.lines[j];
            patch.push([pl[2], pl[3]]);
            i=j;
        }
        var spec = new Spec(key);
        if (StreamOpSource.off_re.test(key)) { // the Victorian way,
            this.removeStreamListeners();      // may just close it
            this.emitEnd(value); // WARN if hs is relayed, check source_id
            break;
        } else if (OpSource.isHandshake(spec)) { // we expect a handshake
            this.emitHandshake(spec, value, patch);
        } else if (!this.hs) {
            StreamOpSource.debug && console.warn('not a handshake: '+key);
            this.emitEnd('not a handshake');
        } else {
            this.emitOp(key, value, patch);
        }
    }
    this.lines = this.lines.slice(till);
};
StreamOpSource.rough_line_re = new RegExp
    ( '^(\\s*)(?:(' + Op.rsSpec + ')(?:\\s+(.*))?)?$' );
StreamOpSource.off_re = /^\/(\w+\+)?Swarm#.*\.off$/;


StreamOpSource.prototype.onStreamEnded = function () {
    if (this.lines.length) {
        this.eatLines(this.lines.length);
    }
    this.removeStreamListeners();
    this.emitEnd();
};


StreamOpSource.prototype.onStreamFailure = function (err) {
    if (util.isError(err)) {
        StreamOpSource.debug && console.warn("SOPS_ERR", err.stack);
        err = err.message;
    } else {
        StreamOpSource.debug && console.error('SOPS_ERR', err);
    }
    var stream = this.stream;
    this.removeStreamListeners();
    this.emitEnd(err);
    this.stream = null;
    try {
        if (stream.close) {
            stream.close();
        } else if (stream.destroy) {
            stream.destroy();
        }
    } catch (ex) {
        StreamOpSource.debug && console.warn('stream fails to close', ex.message);
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


StreamOpSource.prototype.isOpen = function () {
    return !! this.stream;
};


if (typeof(Buffer)==='function') { // for older versions of node
    if (!Buffer.prototype.indexOf) {
        Buffer.prototype.indexOf = function (char, start) {
            for(var i=start; i<this.length; i++) {
                if (this[i]===char) { return i; }
            }
            return -1;
        };
    }
}
