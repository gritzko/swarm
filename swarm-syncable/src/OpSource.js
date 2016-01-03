'use strict';
var Op = require('./Op');
var Spec = require('./Spec');
var EventEmitter = require("eventemitter3");
var util = require("util");


function OpSource () {
    EventEmitter.call(this, {objectMode: true});
    this.peer_hs = null; // peer handshake
    this.hs = null; // our handshake
}
util.inherits(OpSource, EventEmitter);
module.exports = OpSource;


OpSource.prototype.label = function (inbound) {
    var peer = this.peer_hs ? this.peer_hs.stamp() : '?';
    var us = this.hs ? this.hs.stamp() : '?';
    return us + (inbound?'<':'>') + peer;
};


OpSource.prototype.log = function (op, inbound, event) {
    console.log(
        this.label(inbound) +
        (event ? '\t['+event+']' : '') +
        (op ? '\t'+op.toString() : '')
    );
};


OpSource.prototype.source = function () {
    return this.hs ? this.hs.stamp() : '0';
};


OpSource.prototype.emitOp = function (spec, value, patch) {
    var op = new Op(spec, value, this.source(), patch);
    if (OpSource.debug) {
        this.log(op, false);
    }
    this.emit('op', op);
};


OpSource.isHandshake = function (op) {
    return  op.spec.pattern()==='/#!.' &&
            /Swarm(\+.+)?/.test(op.spec.type()) &&
            op.op().toLowerCase()==='on' ;
};


OpSource.prototype.emitHandshake = function (sp, value, patch) {
    if (this.hs) {
        throw new Error('handshake repeat');
    }
    var spec = new Spec(sp);
    var hs = new Op(spec, value, spec.stamp(), patch);
    this.hs = hs;
    if (OpSource.debug) {
        this.log(hs, false, 'HS');
    }
    this.emit('handshake', hs);
};


OpSource.prototype.emitEnd = function () {
    if (OpSource.debug) {
        this.log(null, false, 'END');
    }
    this.emit('end');
};


OpSource.prototype.emitError = function (spec, msg) {
    if (util.isError(spec)) {
        msg = spec.message.replace('/\s+/mg', ' ').substr(0,140);
        spec = '.error';
    } else if (!msg) {
        msg=spec;
        spec='.error';
    }
    var err_op = new Op(spec, msg, this.source());
    if (OpSource.debug) {
        this.log(err_op, false, 'ERROR');
    }
    this.emit('error', err_op);
};


OpSource.prototype.write = function (op, callback) {
    if (OpSource.debug) {
        this.log(op, true);
    }
    this._write(op, callback);
};


OpSource.prototype.writeHandshake = function (hs, callback) {
    if (this.peer_hs) {
        throw new Error('handshake repeat by the peer');
    }
    this.peer_hs = hs;
    if (OpSource.debug) {
        this.log(hs, true, 'HS');
    }
    this._writeHandshake(hs, callback);
};


/** Anti-handshake, in a sense. */
OpSource.prototype.writeEnd = function (op, callback) {
    if (OpSource.debug) {
        this.log(op, true, 'END');
    }
    this._end(op, callback);
};


OpSource.prototype.writeError = function (err_op, callback) {
    if (OpSource.debug) {
        this.log(err_op, true, 'ERROR');
    }
    if (err_op.constructor===String) {
        err_op = new Op('.error', err_op); // FIXME unify, DOCUMENT  fail prop
    }
    this._write(err_op, callback);
};


OpSource.prototype._write = function (op, callback) {
    // not implemented
    callback && callback();
};


OpSource.prototype._writeHandshake = function (op, callback) {
    // not implemented
    callback && callback();
};


OpSource.prototype._end = function (op, callback) {
    // not implemented
    callback && callback();
};
