"use strict";
var stream_url = require('stream-url');

var bat = exports;
bat.BatScript = bat.Script = require("./src/BatScript");

bat.BatStream = require("./src/BatStream");
bat.BatServer = require("./src/BatServer");
bat.BatMux = require("./src/BatMux");
bat.LearnedComparator = require("./src/LearnedComparator");
bat.StreamTest = require("./src/StreamTest");
bat.servers = {};

// register URL adaptors for loopback streams
stream_url.register('loopback:', loopback_listen, loopback_connect);
stream_url.register('lo:', loopback_listen, loopback_connect);

function loopback_listen (stream_url, no_options, callback) {
    return new bat.BatServer(stream_url.hostname.toLowerCase(), {}, callback);
}

function loopback_connect (stream_url, no_options, callback) {
    var stream = new bat.BatStream();
    stream.connect(stream_url.hostname.toLowerCase(), {}, callback);
    return stream;
}
