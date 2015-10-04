"use strict";

var env = require('./env');

var SERVERS = {};
var CONNS = {};

env.clients.loopback = LoopbackStream;
env.servers.loopback = LoopbackServer;

function LoopbackServer (opts) {
    this.opts = opts;
    this.listeners = {};
}

LoopbackServer.prototype.listen = function (url,  callback) {
    var m = url.match(/^loopback:(\w+)$/);
    if (!m) {throw new Error('invalid url');}
    this.id = m[1];
    SERVERS[this.id] = this;
    callback();
};

LoopbackServer.prototype.on = function (event,  callback) {
    this.listeners[event] = callback;
};

function LoopbackStream(opts) {
    this.id = 'C'+(++LoopbackStream.counter);
    CONNS[this.id] = this;
    this.pair_id = undefined;
    this.listeners = {};
    this.queue = [];
    this.timeout = undefined;
    this.async = !!opts.async;
}
LoopbackStream.counter = 0;

LoopbackStream.prototype.connect = function (url, callback) {
    var m = url.match(/^loopback:(\w+)$/);
    if (!m) {throw new Error('invalid url');}
    var srv_id = m[1];
    var server = SERVERS[srv_id];
    var server_stream = new LoopbackStream(server.opts);
    this.pair_id = server_stream.id;
    server_stream.pair_id = this.id;
    server.listeners.connection(server_stream);
    callback();
};


LoopbackStream.prototype.on = function (evname, fn) {
    if (evname in this.listeners) {
        throw new Error('multiple listeners not supported');
    }
    this.listeners[evname] = fn;
};

LoopbackStream.prototype.receive = function (string) {
    this.listeners.data && this.listeners.data(string);
};

LoopbackStream.prototype.pair = function () {
    return CONNS[this.pair_id];
};

LoopbackStream.prototype.write = function (obj) {
    var self = this;
    if (!obj){return;}
    var msg = obj.toString();
    var pair = this.pair();
    function sendItAll () {
        while (pair && self.queue.length) {
            pair && pair.receive(self.queue.shift());
        }
        self.timeout = undefined;
    }
    if (!this.async) {
        pair && pair.receive(msg);
    } else {
        self.queue.push(msg);
        if (this.timeout===undefined) {
            this.timeout = setTimeout(sendItAll, 1);
        }
    }
};

LoopbackStream.prototype.close = function () {
    delete CONNS[this.id];
    var pair = this.pair();
    pair && pair.close();
    this.listeners.close && this.listeners.close();
};
