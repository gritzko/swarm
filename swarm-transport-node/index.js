"use strict";
const RON = require("swarm-ron-grammar");
const UUID = require("swarm-ron-uuid");
const Op = require("swarm-ron");
const Iterator = Op.Frame.Iterator;
const Stream = Op.Stream;
const Duplex = require('stream').Duplex;

class RONStream extends Stream {

    /**
     * Creates an adaptor between a Node.js stream and a RON stream.
     * @param node_stream {Duplex}
     * @param op_stream {Stream}
     * @param mode_upstream {Boolean} -- direction (true on a client)
     */
    constructor (node_stream, op_stream, mode_upstream) {
        super();
        this.tail = "";
        this.mode_upstream = mode_upstream||false;
        /** @type {Stream} */
        this.op_stream = op_stream;
        /** @type {Duplex} */
        this.node_stream = node_stream;
        this.node_stream.on('data', buf => this._parse(buf));
        this.node_stream.on('end', () => this._forward(null));
    }

    on (query, stream) {
        if (stream && stream!==this.op_stream)
            throw new Error('only 1 listener');
        if (!this.mode_upstream)
            throw new Error("no on() in downstream mode");
        this.node_stream.write(query+'\n');
    }

    off (query, stream) {
        if (stream && stream!==this.op_stream)
            throw new Error('only 1 listener');
        if (!this.mode_upstream)
            throw new Error("no off() in downstream mode");
        this.node_stream.write(query+'\n');
    }

    push (frame) {
        if (!this.mode_upstream)
            throw new Error("no push() in downstream mode");
        if (RONStream.DEBUG) console.log('↑',frame);
        if (frame!==null) {
            this.node_stream.write(frame + '\n');
        }else {
            this.node_stream.end();
        }
    }

    _parse (buf) {
        this.tail += buf.toString();
        const p = RONStream.PICKER;
        p.lastIndex = 0;
        let m, off=0;
        while (m=p.exec(this.tail)) {
            const frame = m[1];
            off = m.index + m[0].length;
            this._forward(frame);
        }
        this.tail = this.tail.substr(off);
    }

    _forward (frame) {
        if (this.mode_upstream) {
            if (RONStream.DEBUG) console.log(frame?'↓':'⇣', frame);
            this.op_stream.update(frame, this);
        } else if (frame===null) {
            if (RONStream.DEBUG) console.log('⇡');
            this.op_stream.push(null, this);
        } else {
            if (RONStream.DEBUG) console.log('↑', frame);
            const i = new Iterator(frame);
            if (!i.op.isQuery()) {
                this.op_stream.push(frame, this);
            } else if (i.op.event.eq(UUID.NEVER)) {
                this.op_stream.off(frame, this);
            } else {
                this.op_stream.on(frame, this);
            }
        }
    }

    update (frame) {
        if (this.mode_upstream)
            throw new Error("no update() in upstream mode");
        if (RONStream.DEBUG) console.log(frame);
        if (frame!==null) {
            this.node_stream.write(frame+'\n');
        }else {
            this.node_stream.end();
        }
    }

}
// all frames must be newline-terminated
RONStream.PICKER = new RegExp('('+RON.FRAME.source+")\\n+", "mg");
RONStream.DEBUG = false;

module.exports = RONStream;