"use strict";
var stream_url = require('stream-url');

var bat = exports;
bat.BatStream = require("./src/BatStream");
bat.BatServer = require("./src/BatServer");
bat.BatMux = require("./src/BatMux");
bat.LearnedComparator = require("./src/LearnedComparator");
bat.StreamTest = require("./src/StreamTest");
bat.servers = {};

// register URL adaptors for loopback streams
stream_url.register('loopback:', loopback_listen, loopback_connect);

function loopback_listen (stream_url, callback) {
    return new bat.BatServer(stream_url.host, {}, callback);
}

function loopback_connect (stream_url, callback) {
    var stream = new bat.BatStream();
    stream.connect(stream_url.host, {}, callback);
    return stream;
}

