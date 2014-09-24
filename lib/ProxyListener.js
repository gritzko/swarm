"use strict";

function ProxyListener() {
    this.callbacks = null;
    this.owner = null;
}

ProxyListener.prototype.deliver = function (spec,value,src) {
    if (this.callbacks===null) { return; }
    var that = this.owner || src;
    for(var i=0; i<this.callbacks.length; i++) {
        var cb = this.callbacks[i];
        if (cb.constructor===Function) {
            cb.call(that,spec,value,src);
        } else {
            cb.deliver(spec,value,src);
        }
    }
};

ProxyListener.prototype.on = function (callback) {
    if (this.callbacks===null) { this.callbacks = []; }
    this.callbacks.push(callback);
};

ProxyListener.prototype.off = function (callback) {
    if (this.callbacks===null) { return; }
    var i = this.callbacks.indexOf(callback);
    if (i!==-1) {
        this.callbacks.splice(i,1);
    } else {
        console.warn('listener unknown', callback);
    }
};

module.exports = ProxyListener;
