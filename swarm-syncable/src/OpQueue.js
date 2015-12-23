'use strict';
var EventEmitter = require('eventemitter3');
var util = require('util');

// A very simple FIFO queue that has nothing Op-specific in it actually.
// `limit`: the planned max size of the queue; once `limit` is exceeded
// the queue will keep accepting new data, but it will "complain" (see offer).
function OpQueue (limit) {
    this.queue = new Array(limit||32);
    this.offset = 0;
    this.size = 0;
    this.limit = limit || NaN;
}
util.inherits(OpQueue, EventEmitter);
module.exports = OpQueue;

// Puts an op into the queue. Returns hasSpace()
OpQueue.prototype.offer = function (op) {
    this.queue[this.size++] = op;
    if (this.size===1) {
        this.emit('readable');
    }
    return this.hasSpace();
};


OpQueue.prototype.at = function (i) {
    return this.queue[this.offset+i];
};

// Returns whether the current length of the queue is under the limit.
OpQueue.prototype.hasSpace = function () {
    return this.length() < this.limit;
};

//
OpQueue.prototype.poll = function (op) {
    var ret = this.offset<this.size ? this.queue[this.offset++] : null;
    if (this.offset && this.size<(this.offset<<1)) {
        this.shift();
    }
    return ret;
};


OpQueue.prototype.shift = function () {
    var length = this.length();
    if (this.queue.length>this.limit && length<(this.limit>>1)) {
        'release mem'; // TODO
    }
    for(var i=0; i<length; i++) {
        this.queue[i] = this.queue[this.offset+i];
        this.queue[this.offset+i] = null;
    }
    this.size -= this.offset;
    this.offset = 0;
};


OpQueue.prototype.length = function () {
    return this.size - this.offset;
};
