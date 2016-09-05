"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const OpStream = sync.OpStream;
const Stamp = swarm.Stamp;

/** An OpStream doing auth. Accepts OpStreams, emits handshakes, expects to
 *  be offered either handshakes or errors, 1:1. Hands opstreams to
 *  a SwitchOpStream or closes, depending on the outcome of a handshake. */
class AuthOpStream extends OpStream {

    constructor (switch_stream, callback) {
        super();
        this.streams = new Map();
        this.buffered = new Map();
        this._on_op_cb = this._on_op.bind(this);
        this.clock = new swarm.Clock('~preauth');// TODO same clocks
        this.swtch = switch_stream;
        callback && callback();
    }

    offer (op) {
        const stream_id = op.spec.Stamp;
        const ts = stream_id.value;
        let stream = this.streams.get(ts);
        if (!stream) return;
        stream.off(this._on_op_cb);
        if (op.isOn()) {
            stream._id = new Stamp(ts, op.scope);
            this.swtch.addClient(stream, stream._id);
            let buf = this.buffered.get(ts);
            buf.forEach( o => stream._emit(o) ); // FIXME :[
        } else { // error, off, anything
            stream.offer(op);
            stream.end();
        }
        this.streams.delete(ts);
        this.buffered.delete(ts);
    }

    addClient (opstream) {
        let stream_id = this.clock.issueTimestamp();
        opstream._id = stream_id;
        opstream.on(this._on_op_cb);
        // NOTE no concurrent logins
        this.streams.set(stream_id.value, opstream);
    }

    _on_op (op, stream) {
        let ts = stream._id && stream._id.value;
        if (!ts || !this.streams.has(ts)) {
            stream.off(this._on_op_cb);
            return;
        }
        let buf = this.buffered.get(ts);
        if (!buf) { // TODO unsubscribe, use OpStream queue :)))
            if (!op.isOn() || op.spec.class!==swarm.Op.CLASS_HANDSHAKE) {
                stream.offer(op.error('HANDSHAKE FIRST'));
                stream.off(this._on_op_cb);
                this.streams.delete(ts);
                this.buffered.delete(ts);
                stream.end();
                return;
            }
            this.buffered.set(ts, buf=[]);
            buf.push(op);
            this._emit(op.restamped(stream._id));
        } else {
            buf.push(op); // FIXME OpStream queue (test first)
        }
    }

}

module.exports = AuthOpStream;