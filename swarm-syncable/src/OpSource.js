'use strict';
var Op = require('./Op');
var Spec = require('./Spec');
var EventEmitter = require("eventemitter3");
var util = require("util");

/**
 *   OpSource is an interface for a stream of ops arriving from
 *   some (backing) replica. It can be a local host, a remote
 *   client or a database. This definition is a bit tautological
 *   as a "replica" is anything that creates/consumes/relays
 *   CRDT ops (correctly). OpSource implies some order guarantees
 *   (no causal reordering etc, see "causal broadcast").
 *   Essentially, OpSource is an end of a "pipe" that goes to
 *   to some another replica.
 *   OpSource emits three types of events:
*
 *   * `handshake` specifies the context for the rest of the ops,
 *     such as the id of the session on the other end, the id
 *     of the database, the id of the connection and suchlike,
 *   * `op` is a regular CRDT op (such as `.set`) or a subscription/
 *      unsubscription pseudo-op (`.on`, `.off`), or an `.error`,
 *   * `end` is the end of this stream; no further events allowed.
*
 *   A special note on error handling. OpStream has no dedicated
 *   `error` event. All transient (recoverable) errors are transmitted
 *   in the stream as `.error` operations and emitted as such.
 *   Those may be scoped to particular objects and operations.
 *   Irrecovearable errors are passed to/emitted with the `end` event.
*
 *   This class is abstract; see StreamOpSource for an OpSource for
 *   a remote replica connected by a binary stream, Host for a local
 *   CRDT replica, LevelOpSource for a LevelDB-backed replica.
 *   @class
 */
function OpSource (options) {
    EventEmitter.call(this);
    this.peer_hs = null; // peer handshake
    this.hs = null; // our handshake
    this.source_id = null;
    options.onHandshake && this.on('handshake', options.onHandshake);
    options.onOp && this.on('op', options.onOp);
    options.onEnd && this.on('end', options.onEnd);
}
util.inherits(OpSource, EventEmitter);
module.exports = OpSource;
OpSource.DEFAULT = new Spec('/Model!0.on');


OpSource.prototype.label = function (inbound) {
    var peer = this.peer_hs ? this.peer_hs.stamp() : '?';
    var us = this.hs ? this.hs.stamp() : '?';
    return us + (inbound?'<':'>') + peer;
};


OpSource.prototype.log = function (op, inbound, event) {
    console.log(
        this.label(inbound) +
        (event ? '\t['+event+']' : '') +
        (op ? '\t'+op.spec.toString()+'\t'+op.value : '')
    );
};

/**
 *  Source is an unique id for an op source ("pipe end") that is
 *  (normally) a Lamport timestamp issued by its backing replica.
 */
OpSource.prototype.source = function () {
    return this.source_id || '0';
};

/**
 * For use by descendant classes: emit an op.
 */
OpSource.prototype.emitOp = function (key, value, kv_patch) {
    var patch = null, source = this.source();
    var spec = new Spec(key, null, OpSource.DEFAULT);
    if (kv_patch) {
        if (kv_patch.constructor!==Array) {
            throw new Error('need an array of {key,value} objects');
        }
        var typeId = spec.typeId();
        patch = kv_patch.map(function(kv){
            var sp = new Spec(kv.key, typeId, OpSource.DEFAULT);
            return new Op(sp, kv.value, source);
        });
    }
    var op = new Op(spec, value, source, patch);
    if (OpSource.debug) {
        this.log(op, false);
    }
    this.emit('op', op, this);
};


OpSource.isHandshake = function (spec) {
    return  spec.pattern()==='/#!.' &&
            /Swarm(\+.+)?/.test(spec.type());
//            spec.op()==='on';
};


/**
 *  For use by descendant classes: emit a handshake (sent by the
 *  backing replica).
 */
OpSource.prototype.emitHandshake = function (sp, value, patch) {
    if (this.hs) {
        throw new Error('handshake repeat');
    }
    var spec = new Spec(sp);
    var hs = new Op(spec, value, spec.stamp(), patch);
    this.hs = hs;
    this.source_id = hs.stamp();
    if (OpSource.debug) {
        this.log(hs, false, 'HS');
    }
    this.emit('handshake', hs, this);
};

/**
 *  End of the stream. No more ops from the backing replica will arrive.
 */
OpSource.prototype.emitEnd = function (error) {
    if (OpSource.debug) {
        this.log(new Op('.off', error||''), false, 'END');
    }
    this.emit('end', error, this);
};


/**
 *  Send an op to the backing replica. No completion callback;
 *  the interface is a fully asynchronous fire-and-forget.
 *  (The reason: the fact we send something by the network does
 *  not mean it will reach the destination; even if it reaches
 *  destination, the backing replica may forget it. Such cases
 *  are resolved at the protocol level: acknowledgements, echos,
 *  subscription handshakes, etc. Callbacks are useless, except
 *  for the end callback, which conveys the fact all the ops were
 *  "sent" or "saved" and that we can do no better this time.)
 */
OpSource.prototype.writeOp = function (op) {
    if (OpSource.debug) {
        this.log(op, true);
    }
    this._writeOp(op);
};
OpSource.prototype.write = OpSource.prototype.writeOp;

/** Send a handshake to the backing replica. */
OpSource.prototype.writeHandshake = function (hs) {
    if (this.peer_hs) {
        throw new Error('handshake repeat by the peer');
    }
    this.peer_hs = hs;
    this.source_id = hs.stamp();
    if (OpSource.debug) {
        this.log(hs, true, 'HS');
    }
    this._writeHandshake(hs);
};

/**
 *  Close this "pipe". Optionally, transmits an error message.
 *  Invokes a callback once everything is done.
 */
OpSource.prototype.writeEnd = function (op, callback) {
    if (!op || op.constructor===String) {
        op = new Op('.off', op||'');
    }
    if (OpSource.debug) {
        this.log(op, true, 'END');
    }
    this._writeEnd(op, callback);
};
OpSource.prototype.end = OpSource.prototype.writeEnd;

/**  `writeOp` implementation (to be overridden)
 *   @virtual */
OpSource.prototype._writeOp = function (op, callback) {
    // not implemented
    callback && callback();
};

/**  `writeHandshake` implementation (to be overridden)
 *   @virtual  */
OpSource.prototype._writeHandshake = function (op, callback) {
    // not implemented
    callback && callback();
};

/**  `writeEnd` implementation (to be overridden)
 *   @virtual */
OpSource.prototype._writeEnd = function (op, callback) {
    // not implemented
    callback && callback();
};
