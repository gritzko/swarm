"use strict";
var env = require('../lib/env.js');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var stream = require('stream');

function TestStream (id, stream_out) {
    EventEmitter.call(this);
    this.id = id;
    this.stream_out = stream_out;
    //this.lstn = {};
}
util.inherits(TestStream, EventEmitter);
env.clients.test = TestStream;

TestStream.prototype.write = function (str) {
    this.stream_out.write(this.id+' '+str);
};

TestStream.prototype.close = function (str) {
    this.stream_out.write(this.id+':CLOSED\n');
    this.emit('end');
};

/*TestStream.prototype.on = function (event, callback) {
    this.lstn[event] = callback;
};

TestStream.prototype.emit = function (event, str) {
    var callback = this.lstn[event];
    callback && callback(str);
};*/


function TestServer (url) {
    EventEmitter.call(this);
    this.piece = '';
    this.streams = {};
    this.stream_in = null;
    this.stream_out = null;
}
util.inherits(TestServer, EventEmitter);
env.servers.test = TestServer;

TestServer.prototype.listen = function (url, callback){
    if (url==='test:' || url==='test:std') {
        this.stream_in = process.stdin;
        this.stream_out = process.stdout;
    } else if (url==='test:strings') {
        var LoopbackStream = require('loopback-stream');
        var uno = new LoopbackStream();
        this.stream_in = uno;
        this.stream_out = uno;
        this.dual_stream = new LoopbackStream(uno);
    } else {
        throw new Error('not implemented yet');
    }
    this.stream_in.on('data', this.onDataIn.bind(this));
    callback();
};

/*TestStream.prototype.on = function (event, callback) {
    this.lstn[event] = callback;
};*/

TestServer.prototype.onDataIn = function (chunk){
    this.piece += chunk;
    var m, self = this;
    console.warn('parsing', this.piece);
    while ( m = this.piece.match(/^(&[0-9A-Za-z_~]+)\s{1,4}(.*\n(\s.*\n)*)/m) ) {
        console.warn('parsed', m);
        var stream_id = m[1], line = m[2];
        var stream = this.streams[stream_id];
        if (!stream) {
            stream = this.streams[stream_id] =
                new TestStream(stream_id, this.stream_out);
            stream.on('end', function(){
                delete self.streams[stream_id];
            });
            this.emit('connection', stream);
        }
        stream.emit('data',line);
        this.piece = this.piece.substr(m.index+m[0].length);
    }
};
