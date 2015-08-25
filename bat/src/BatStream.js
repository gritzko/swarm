"use strict";
var util = require('util');
var stream = require('stream');
var BatServer = require('./BatServer');
//var url = require('url');

/**
A simple duplex loopback stream implementation: everything
written to a bat_stream gets emitted by bat_stream.pair.
A BatStream can connect to a BatServer:

    var srv1 = new BatServer('srv1');
    var in_stream = new BatStream.connect('bat:srv1');
    // srv1 emits 'connection', in_stream.pair is an arg.

*/
function BatStream (pair) {
    stream.Duplex.call(this);
    if (pair) {
        this._pair(pair);
        pair._pair(this);
    } else {
        this.pair = new BatStream(this);
    }
    this.out_str = '';
}
util.inherits(BatStream, stream.Duplex);
exports = module.exports = BatStream;

BatStream.prototype._pair = function (pair) {
    var self = this;
    this.pair = pair;

    /*
    pair.on('finish', function(){
        self.emit('end');
    });
    */
};

BatStream.prototype._read = function (size) {};
BatStream.prototype._write = function (chunk, encoding, callback) {
    if (this.pair) {
        this.pair.push(chunk);
    } else {
        this.out_str += chunk;
    }
    callback();
};
BatStream.prototype.pop = function () {
    var ret = this.out_str;
    this.out_str = '';
    return ret;
};

BatStream.prototype.connect = function (srv_id, options, callback) {
    var attempt = 0, self=this;

    function connect_to_server(){
        var srv = BatServer.servers[srv_id];
        if (!srv) {
            if (++attempt<10) {
                setTimeout(connect_to_server, 10);
            } else {
                console.error('server not known: '+srv_id);
                callback && callback("server not known");
            }
        } else {
            srv._bat_connect(srv_id, self.pair);
            callback && callback(null, self);
            self.emit('connect', self);
        }
    }

    setTimeout(connect_to_server, 1);
};

BatStream.prototype.end = function () {
    stream.Duplex.prototype.end.apply(this,arguments);
    this.pair && this.pair.push(null);
};
