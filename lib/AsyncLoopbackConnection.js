"use strict";

var env = require('./env');

function AsyncLoopbackConnection(url) {
    var m = url.match(/loopback:(\w+)/);
    if (!m) {
        throw new Error('invalid url');
    }
    this.id = m[1];
    this.lstn = {};
    this.queue = [];
    if (this.id in AsyncLoopbackConnection.pipes) {
        throw new Error('duplicate');
    }
    AsyncLoopbackConnection.pipes[this.id] = this;
    var pair = this.pair();
    if (pair && pair.queue.length) {
        pair.write();
    }
}
AsyncLoopbackConnection.pipes = {};

env.streams.loopback = AsyncLoopbackConnection;

AsyncLoopbackConnection.prototype.pair = function () {
    var pairId = this.id.match(/./g).reverse().join('');
    return AsyncLoopbackConnection.pipes[pairId];
};

AsyncLoopbackConnection.prototype.on = function (evname, fn) {
    if (evname in this.lstn) {
        throw new Error('multiple listeners not supported');
    }
    this.lstn[evname] = fn;
};

AsyncLoopbackConnection.prototype.receive = function (string) {
    this.lstn.data && this.lstn.data(string);
};

AsyncLoopbackConnection.prototype.write = function (obj) {
    var self = this;
    obj && self.queue.push(obj.toString());
    setTimeout(function () {
        var pair = self.pair();
        if (!pair) {
            return;
        }
        while (self.queue.length) {
            pair.receive(self.queue.shift());
        }
    }, 1);
};

AsyncLoopbackConnection.prototype.close = function () {
    delete AsyncLoopbackConnection.pipes[this.id];
    var pair = this.pair();
    pair && pair.close();
    this.lstn.close && this.lstn.close();
};
