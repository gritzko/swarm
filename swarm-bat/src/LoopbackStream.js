"use strict";
var stream = require('stream');

/**
A simple duplex loopback stream implementation: everything
written to a bat_stream gets emitted by bat_stream.pair.
In case `pair` is null, it becomes an echo stream.
*/
module.exports = class BatStream extends stream.Duplex {

    constructor (pair, options) {
        super(options);
        if (pair===undefined) {
            pair = new BatStream(this);
        } else if (pair===null) {
            pair = this;
        }
        this._pair = pair;
        pair._pair = this;
    }

    _read (size) {
    }

    _write (chunk, encoding, callback) {
        this.pair.push(chunk);
        callback && callback();
    }

    end () {
        stream.Duplex.prototype.end.apply(this,arguments);
        this.pair && this.pair.push(null);
    }

    destroy () {
        this.end();
    }

    get pair () {
        return this._pair;
    }

};
