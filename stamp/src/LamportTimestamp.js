"use strict";
var base64 = require('./base64');

LamportTimestamp.reTok = new RegExp('^'+base64.rT+'$'); // plain no-extension token
LamportTimestamp.rsTokExt = '(=)(?:\\+(=))?'.replace(/=/g, base64.rT);
LamportTimestamp.reTokExt = new RegExp('^'+LamportTimestamp.rsTokExt+'$');
LamportTimestamp.reTokExtMG = new RegExp(LamportTimestamp.rsTokExt, 'mg');

function LamportTimestamp (time, source) {
    var plus = time.indexOf('+');
    if (plus>0) {
        source = time.substr(plus+1);
        time = time.substr(0, plus);
    }
    if (!base64.reTok.test(time)) {
        throw new Error("invalid time format");
    }
    if (source && !base64.reTok.test(source)) {
        throw new Error("invalid source format");
    }
    this._time = time || '0';
    this._source = source || '';
}

LamportTimestamp.prototype.toString = function () {
    return this._time + (this._source ? '+' + this._source : '');
};

LamportTimestamp.parse = function parseArbitraryString (str) {
    var ret = [], m;
    LamportTimestamp.reTokExtMG.lastIndex = 0;
    while (m = LamportTimestamp.reTokExtMG.exec(str)) {
        ret.push(new LamportTimestamp(m[1], m[2]));
    }
    return ret;
};

LamportTimestamp.prototype.time = function () {return this._time;};
LamportTimestamp.prototype.source = function () {return this._source;};

module.exports = LamportTimestamp;
