"use strict";
var base64 = require('./base64');

LamportTimestamp.reTok = new RegExp('^'+base64.rT+'$'); // plain no-extension token
LamportTimestamp.rsTokExt = '(=)(?:\\+(=))?'.replace(/=/g, base64.rT);
LamportTimestamp.reTokExt = new RegExp('^'+LamportTimestamp.rsTokExt+'$');
LamportTimestamp.reTokExtMG = new RegExp(LamportTimestamp.rsTokExt, 'mg');

// A Lamport timestamp is a pair of a time value and a process id (source).
// The order is lexicographic both for time values and timestamps.
// Constructor examples: new LT("0time","author"), new LT("0time+author").
// new LT("author") is understood as "0+author"; empty source is not valid,
// unless the time value is 0 (new LT() is "0").
function LamportTimestamp (time, source) {
    if (!source) {
        if (!time) {
            time = '0';
            source = '';
        } else {
            var m = LamportTimestamp.reTokExt.exec(time);
            if (!m) {
                throw new Error('malformed Lamport timestamp');
            }
            time = m[1];
            source = m[2] || '';
        }
    }
    if (!source && time!=='0') {
        source = time;
        time = '0';
    }
    this._time = time || '0';
    this._source = source || '';
}

LamportTimestamp.prototype.toString = function () {
    return this._time + (this._source ? '+' + this._source : '');
};

LamportTimestamp.is = function (str) {
    LamportTimestamp.reTokExt.lastIndex = 0;
    return LamportTimestamp.reTokExt.test(str);
};

LamportTimestamp.prototype.isZero = function () {
    return this._time === '0';
};

// Is greater than the other stamp, according to the the lexicographic order
LamportTimestamp.prototype.gt = function (stamp) {
    if (stamp.constructor!==LamportTimestamp) {
        stamp = new LamportTimestamp(stamp);
    }
    return this._time > stamp._time ||
        (this._time===stamp._time && this._source>stamp._source);
};

LamportTimestamp.prototype.eq = function (stamp) {
    if (stamp.constructor!==LamportTimestamp) {
        stamp = new LamportTimestamp(stamp);
    }
    return this._time===stamp._time && this._source===stamp._source;
};

LamportTimestamp.parse = function parseArbitraryString (str) {
    var ret = [], m;
    if (!str) { return ret; }
    LamportTimestamp.reTokExtMG.lastIndex = 0;
    while (m = LamportTimestamp.reTokExtMG.exec(str)) {
        ret.push(new LamportTimestamp(m[1], m[2]));
    }
    return ret;
};

LamportTimestamp.prototype.time = function () {return this._time;};
LamportTimestamp.prototype.source = function () {return this._source;};
LamportTimestamp.prototype.author = function () {
    var i = this._source.indexOf('~');
    return i===-1 ? this._source : this._source.substr(0,i);
};

module.exports = LamportTimestamp;
