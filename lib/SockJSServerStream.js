"use strict";

function SockJSStream(ws) {
    var ln = this.lstn = {},
        buf = [];

    if (typeof ws === 'string') { // url passed
        throw new Error('client-side connections not supported yet');
    }
    this.ws = ws;
    if (ws.readyState !== 1/*WebSocket.OPEN*/) {
        this.buf = buf; //will wait for "open"
    }
    ws.on('close', function () { ln.close && ln.close(); });
    ws.on('data', function (msg) {
        try {
            ln.data && ln.data(msg);
        } catch (ex) {
            console.error('message processing fails', ex);
            ln.error && ln.error(ex.message);
        }
    });
}

module.exports = SockJSStream;

SockJSStream.prototype.on = function (evname, fn) {
    if (evname in this.lstn) {
        throw new Error('not supported');
    }
    this.lstn[evname] = fn;
};

SockJSStream.prototype.write = function (data) {
    if (this.buf) {
        this.buf.push(data.toString());
    } else {
        this.ws.write(data.toString());
    }
};

//TODO SockJS-client env.streams.ws = env.streams.wss = SockJSStream;
