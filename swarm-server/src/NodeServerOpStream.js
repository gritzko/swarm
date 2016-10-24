"use strict";
const net = require('net');
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const OpStream = sync.OpStream;
const Op = swarm.Op;

/** An OpStream on top of a Node.js stream.
 *  Maintains batching guarantees: sends data asynchronously, terminates
 *  a bundle with \n\n. Expects incoming bundles to be \n\n terminated. */
class NodeServerOpStream extends OpStream {

    /** @param stream - Node.js stream */
    constructor (stream, options, upstream) {
        super(options);
        this._upstream = upstream;
        this._stream = stream;
        stream.setEncoding('utf8');
        this._chunks = [];
        this._ops = [];
        this._send_to = null;
        this._on_data_cb = this._on_data.bind(this);
        this._on_end_cb = this._on_end.bind(this);
        this._send_cb = this._send.bind(this);
        upstream && upstream.on(this);
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
            chunks.push(chunk.substr(0, at+2));
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
            this.offerAll(ops);
        }
    }

    offer (op) {
        if (this._debug)
            console.warn(this._debug+'}}\t'+(op?op.toString():'[EOF]'));
        this._upstream.offer(op, this);
    }

    _apply (op) {
        if (this._debug)
            console.warn(this._debug+'{\t'+(op?op.toString():'[EOF]'));
        this._ops.push(op);
        if (this._send_to===null)
            this._send_to = setTimeout(this._send_cb, 1);
    }

    _send () {
        if (this._stream===null)
            return; // closed concurrently
        this._send_to = null;
        if (!this._ops.length)
            return;
        const ops = this._ops;
        this._ops = [];
        const end = ops[ops.length-1]===null;
        if (this._debug)
            console.warn('<'+this._debug+'\t['+(end?(ops.length-1)+'EOF':ops.length)+']');
        if (end) {
            ops.pop();
            this._stream.end(Op.serializeFrame(ops));
            this._stream = null;
        } else {
            this._stream.write(Op.serializeFrame(ops));
        }
    }

    _on_end () {
        if (this._stream===null)
            return; // closed
        this._stream.removeListener('data', this._on_data_cb);
        this._stream.removeListener('end', this._on_end_cb);
        this.offer(null);
    }

}


class NodeServer {
    constructor (url, options, upstream) {
        const scheme = url.scheme[0];
        if (scheme==='std') {
            const stream = require('duplexify')(process.stdout, process.stdin);
            stream.end = function(){console.warn('end');};
            const std = new NodeServerOpStream(stream, options, upstream);
        } else {
            this._server = net.createServer(stream =>
                new NodeServerOpStream(stream, options, upstream)
            );
            if (scheme==='tcp')
                this._server.listen(url.port, url.hostname);
            else if (scheme==='sock')
                this._server.listen(url.path);
            else
                throw new Error('unknown protocol');
        }
    }

    close () {
        if (this._server) {
            this._server.close();
            this._server = null;
        }
    }
}
NodeServerOpStream.Server = NodeServer;

OpStream._SERVER_URL_HANDLERS['tcp'] = NodeServer;
OpStream._SERVER_URL_HANDLERS['std'] = NodeServer;
OpStream._SERVER_URL_HANDLERS['sock'] = NodeServer;

module.exports = NodeServerOpStream;
