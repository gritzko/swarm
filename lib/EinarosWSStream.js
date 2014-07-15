'use strict';

function EinarosWSStream(ws) {
    var self = this;
    var ln = this.lstn = {};
    this.ws = ws;
    var buf = [];
    if (ws.readyState !== 1/*WebSocket.OPEN*/) this.buf = buf; //will wait for "open"
    ws.on('open', function () {
        buf.reverse();
        self.buf = null;
        while (buf.length) self.write(buf.pop());
    });
    ws.on('close', function () { ln.close && ln.close(); });
    ws.on('message', function (msg) {
        try {
            console.log(msg);
            ln.data && ln.data(msg);
        } catch(ex) {
            console.error('message processing fails',ex);
            ln.error && ln.error(ex.message);
        }
    });
    ws.on('error', function (msg) { ln.error && ln.error(msg); });
}
exports.EinarosWSStream = EinarosWSStream;

EinarosWSStream.prototype.on = function (evname,fn) {
    if (evname in this.lstn) throw 'not supported';
    this.lstn[evname] = fn;
};

EinarosWSStream.prototype.write = function (data) {
    if (this.buf)
        this.buf.push(data.toString());
    else
        this.ws.send(data.toString());
};

module.exports = EinarosWSStream;
