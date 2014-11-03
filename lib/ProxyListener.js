"use strict";

function ProxyListener() {
    this.callbacks = [];
    this.owner = null;
}

ProxyListener.prototype.deliver = function (spec,value,src) {
    var that = this.owner || src;
    this.callbacks.forEach(function notifyCallback(cb) {
        if (cb.constructor === Function) {
            cb.call(that,spec,value,src);
        } else {
            cb.deliver(spec,value,src);
        }
    });
};

ProxyListener.prototype.on = function (callback) {
    this.callbacks.push(callback);
};

ProxyListener.prototype.off = function (callback) {
    var i = this.callbacks.indexOf(callback);
    if (i!==-1) {
        this.callbacks.splice(i,1);
    } else {
        console.warn('listener unknown', callback);
    }
};

ProxyListener.prototype.toString = function () {
    return (this.owner && this.owner.toString() || '?') + '-Proxy';
};

module.exports = ProxyListener;
