"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const OpStream = sync.OpStream;
const Op = swarm.Op;

/** An OpStream on top of a Node.js stream.
 *  Maintains batching guarantees: sends data asynchronously, terminates
 *  a bundle with \n\n. Expects incoming bundles to be \n\n terminated. */
class NodeOpStream extends OpStream {

    /** @param stream - Node.js stream */
    constructor (stream) {
        super();
        this._stream = stream;
        stream.setEncoding('utf8');
        this._chunks = [];
        this._ops = [];
        this._send_to = null;
        this._on_data_cb = this._on_data.bind(this);
        this._on_end_cb = this._on_end.bind(this);
        this._send_cb = this._send.bind(this);

        this._stream.on('data', this._on_data_cb);
        this._stream.on('end', this._on_end_cb);
    }

    _start () {
    }

    _on_data (chunk) {
        const chunks = this._chunks;
        const had_nl = chunks.length && /\n$/m.test(chunks[chunks.length-1]);
        const at = chunk.indexOf('\n\n');
        if (had_nl&&chunk[0]==='\n') {
            this._on_batch();
            this._on_data(chunk.substr(1));
        } else if (at!==-1) {
            chunks.push(chunk.substr(0, at+2))
            this._on_batch();
            if (at+2<chunk.length)
                this._on_data(chunk.substr(at+2));
        } else {
            chunks.push(chunk);
        }
    }

    _on_batch () {
        const frame = this._chunks.join('');
        this._chunks = [];
        let ops = swarm.Op.parseFrame(frame);
        if (!ops.length || ops===null) {
            this._close();
        } else {
            this._emitAll(ops);
        }
    }

    offer (op) {
        if (this._debug)
            console.warn('}'+this._debug+'\t'+(op?op.toString():'[EOF]'));
        if (op===null) {
            return this.close(); // TODO half-close
        }
        this._ops.push(op);
        if (this._send_to===null)
            this._send_to = setTimeout(this._send_cb, 1);
    }

    _send () {
        if (this._stream===null)
            return; // closed concurrently
        this._send_to = null;
        const ops = this._ops;
        if (!ops.length)
            return;
        if (this._debug)
            console.warn('['+this._debug+'\t['+ops.length+']');
        let frame = Op.serializeFrame(ops);
        this._stream.write(frame);
        this._ops.length = 0;
    }

    _on_end () {
        if (this._stream===null)
            return; // closed
        this._send();
        this.close();
    }

    close () {
        if (this._stream===null)
            return;
        this._stream.removeListener('data', this._on_data_cb);
        this._stream.removeListener('end', this._on_end_cb);
        this._send();
        this._stream.end();
        this._stream = null;
        super._end();
    }

}

module.exports = NodeOpStream;