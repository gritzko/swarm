"use strict";
var bat = require('test-bat');
var env = require('../lib/env');

env.clients.bat = function (url, options, callback, err_callback) {
    var stream = new bat.BatStream();
    stream.connect(url, options);
    stream.on('connect', callback);
    err_callback && stream.on('error', err_callback);
    return stream;
};
env.servers.bat =  function (url, options, callback, err_callback) {
    var serv = new bat.BatServer();
    serv.listen(url, options);
    serv.on('connection', callback);
    err_callback && serv.on('error', err_callback);
    return serv;
};
