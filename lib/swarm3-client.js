function WSStream (url) {
    var self = this;
    var ln = this.lstn = {};
    var ws = this.ws = new WebSocket(url);
    var buf = this.buf = [];
    ws.onopen = function (str) {
        buf.reverse();
        self.buf = null;
        while (buf.length)
            self.write(buf.pop());
            
    };
    ws.onclose = function () { ln.close && ln.close() };
    ws.onmessage = function (msg) { ln.data && ln.data(msg.data) };
    ws.onerror = function () { ln.error && ln.error() };
}

WSStream.prototype.on = function (evname,fn) {
    if (evname in this.lstn) throw 'not supported';
    this.lstn[evname] = fn;
};

WSStream.prototype.write = function (data) {
    console.log('writing',data);
    if (this.buf)
        this.buf.push(data);
    else
        this.ws.send(data);
};

Swarm.Pipe.streams.ws = Swarm.Pipe.streams.wss = WSStream;

