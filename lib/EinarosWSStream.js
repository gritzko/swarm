"use strict";

var env = require('./env');
var ws_lib = require('ws');

function EinarosWSStream(ws) {
    var self = this,
        ln = this.lstn = {},
        buf = [];

    if (typeof ws === 'string') { // url passed
        ws = new ws_lib(ws);
    }
    this.ws = ws;
    if (ws.readyState !== 1/*WebSocket.OPEN*/) {
        this.buf = buf; //will wait for "open"
    }
    ws.on('open', function () {
        buf.reverse();
        self.buf = null;
        while (buf.length) {
            self.write(buf.pop());
        }
    });
    ws.on('close', function () { ln.close && ln.close(); });
    ws.on('message', function (msg) {
        try {
            ln.data && ln.data(msg);
        } catch (ex) {
            console.error('message processing fails', ex);
            ln.error && ln.error(ex.message);
        }
    });
    ws.on('error', function (msg) { ln.error && ln.error(msg); });
}

module.exports = EinarosWSStream;

EinarosWSStream.prototype.on = function (evname, fn) {
    if (evname in this.lstn) {
        throw new Error('not supported');
    }
    this.lstn[evname] = fn;
};

EinarosWSStream.prototype.write = function (data) {
    if (this.buf) {
        this.buf.push(data.toString());
    } else {
        this.ws.send(data.toString());
    }
};

env.streams.ws = env.streams.wss = EinarosWSStream;
