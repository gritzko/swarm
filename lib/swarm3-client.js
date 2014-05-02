function WSStream (url) {
    var ln = this.lstn = {};
    var ws = this.ws = new WebSocket(url);
    ws.onopen = function () { ln.open && ln.open() };
    ws.onclose = function () { ln.close && ln.close() };
    ws.onmessage = function (msg) { ln.data && ln.data(msg.toString()) };
    ws.onerror = function () { ln.error && ln.error() };
}

WSStream.prototype.on = function (evname,fn) {
    if (evname in ln) throw 'not supported';
    this.lstn[evname] = fn;
};

WSStream.prototype.write = function (data) {
    this.ws.send(data.toString());
};

Swarm.Pipe.streams.ws = Swarm.Pipe.streams.wss = WSStream;

