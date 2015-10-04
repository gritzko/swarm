"use strict";

var env = require('./env');

function WebSocketStream(url) {
    var self = this;
    var ln = this.lstn = {};
    this.url = url;
    var ws = this.ws = new WebSocket(url);
    var buf = this.buf = [];
    ws.onopen = function () {
        buf.reverse();
        self.buf = null;
        while (buf.length) {
            self.write(buf.pop());
        }

    };
    ws.onclose = function () { ln.close && ln.close(); };
    ws.onmessage = function (msg) {
        ln.data && ln.data(msg.data);
    };
    ws.onerror = function (err) { ln.error && ln.error(err); };
}

WebSocketStream.prototype.on = function (evname, fn) {
    if (evname in this.lstn) {
        var self = this,
            prev_fn = this.lstn[evname];
        this.lstn[evname] = function () {
            prev_fn.apply(self, arguments);
            fn.apply(self, arguments);
        };
    } else {
        this.lstn[evname] = fn;
    }
};

WebSocketStream.prototype.write = function (data) {
    if (this.buf) {
        this.buf.push(data);
    } else {
        this.ws.send(data);
    }
};

env.streams.ws = env.streams.wss = WebSocketStream;
module.exports = WebSocketStream;
