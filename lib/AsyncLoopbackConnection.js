"use strict";

var knownStreams = require('./env').streams;

/**
 * @param {string|AsyncLoopbackConnection} url
 * @constructor
 */
function AsyncLoopbackConnection(url) {
    var stream = this;

    var lstn = {};
    var queue = [];
    var id;
    var paired;

    Object.defineProperty(stream, 'id', { get: function () { return id; } });
    stream.on = on;
    stream.write = write;
    stream.close = close;
    stream.toString = toString;
    stream._receive = receive;

    if (typeof url === 'string') {
        var m = url.match(/loopback:(\w+)/);
        if (!m) {
            throw new Error('invalid url');
        }
        id = m[1];
        paired = new AsyncLoopbackConnection(stream);
    } else if (url instanceof AsyncLoopbackConnection) {
        paired = url;
        id = paired.id.match(/./g).reverse().join('');

        var uplink = AsyncLoopbackConnection.uplinks[paired.id];
        if (!uplink) {
            throw new Error('no uplink set for connection url: "' + url + '"');
        }
        uplink.accept(stream);
    }

    function on(evname, fn) {
        if (evname in lstn) {
            throw new Error('multiple listeners not supported');
        }
        lstn[evname] = fn;
    }

    function receive(string) {
        lstn.data && lstn.data(string);
    }

    function write(obj) {
        obj && queue.push(obj.toString());
        setTimeout(function asyncWrite() {
            while (queue.length) {
                paired._receive(queue.shift());
            }
        }, AsyncLoopbackConnection.delay());
    }

    function close(closePaired) {
        if (!closePaired) { paired.close(true); }
        setTimeout(function asyncClose() {
            lstn.close && lstn.close();
        }, AsyncLoopbackConnection.delay());
    }

    function toString() {
        return '|' + id;
    }
}
AsyncLoopbackConnection.pipes = {};

AsyncLoopbackConnection.uplinks = {};
AsyncLoopbackConnection.registerUplink = function (url, uplink) {
    var m = url.match(/loopback:(\w+)/);
    if (!m) { throw new Error('invalid url'); }
    AsyncLoopbackConnection.uplinks[m[1]] = uplink;
};

AsyncLoopbackConnection.delay = function delay_for_1ms() {
    return 1;
};

knownStreams.loopback = AsyncLoopbackConnection;

module.exports = AsyncLoopbackConnection;
