"use strict";
var url_pkg = require('url');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var url = require('url');

/** A server TestStreams can connect to.
    test_stream.connect('test:server1') leads to BatServer "server1"
    emitting "connection", test_stream.pair being the argument. */
function BatServer (id, options, callback) {
    EventEmitter.call(this);
    this.id = null;
    this.streams = {};
    if (id) {
        this.listen(id, options, callback);
    }
}
util.inherits(BatServer, EventEmitter);
module.exports = BatServer;
BatServer.servers = {};

BatServer.prototype._bat_connect = function (uri, bat_stream) {
    this.emit('connection', bat_stream);
};

BatServer.prototype.listen = function (id, nothing, callback){
    var error = null, self=this;
    if (!id) { throw new Error('no id specified'); }
    if (id.constructor===String && id.indexOf(':')!==-1) {
        id = url.parse(id).hostname;
    } else if (id.hostname) {
        id = id.hostname;
    } else {
        id = id.toString();
    }
    id = id.toLowerCase();
    if (this.id) {
        error = 'can listen one id only';
    } else if (this.id in BatServer.servers) {
        error = 'id is taken already';
    } else {
        this.id = id;
        BatServer.servers[this.id] = this;
    }
    setTimeout(function(){
        callback && callback(error, self);
    }, 1);
};

BatServer.prototype.close = function (){
    delete BatServer.servers[this.id];
};
