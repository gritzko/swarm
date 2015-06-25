"use strict";
var util = require('util');
var EventEmitter = require('events').EventEmitter;

/** A server TestStreams can connect to. 
    test_stream.connect('test:server1') leads to BatServer "server1"
    emitting "connection", test_stream.pair being the argument. */
function BatServer (id) {
    EventEmitter.call(this);
    this.id = null;
    this.streams = {};
    if (id) {
        this.listen(id);
    }
}
util.inherits(BatServer, EventEmitter);
module.exports = BatServer;
BatServer.servers = {};

BatServer.prototype._bat_connect = function (uri, bat_stream) {
    this.emit('connection', bat_stream);
};

BatServer.prototype.listen = function (url, callback){
    if (this.id) {
        throw new Error('can listen one id only');
    }
    var m = url.toString().match(/^(bat:)?(\w+)/);
    if (!m) {
        throw new Error('malformed id/url');
    }
    this.id = m[2];
    if (this.id in BatServer.servers) {
        throw new Error('id is taken already');
    }
    BatServer.servers[this.id] = this;
};

BatServer.prototype.close = function (){
    delete BatServer.servers[this.id];
};

