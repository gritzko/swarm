"use strict";
var util = require('util');
var stream = require('stream');

function LoopbackStream (pair) {
    stream.Duplex.call(this);
    if (pair) {
        this._pair(pair);
        pair._pair(this);
    } else {
        this.pair = null;
    }
    this.out_str = '';
}
util.inherits(LoopbackStream, stream.Duplex);
module.exports = LoopbackStream;

LoopbackStream.prototype._pair = function (pair) {
    var self = this;
    this.pair = pair;
    pair.on('finish', function(){
        self.emit('end');
    });
};

LoopbackStream.prototype._read = function (size) {};
LoopbackStream.prototype._write = function (chunk, encoding, callback) {
    if (this.pair) {
        this.pair.push(chunk);
    } else {
        this.out_str += chunk;
    }
    callback();
};
LoopbackStream.prototype.pop = function () {
    var ret = this.out_str;
    this.out_str = '';
    return ret;
};
