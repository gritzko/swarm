"use strict";

var Spec = require('./Spec');

/** Pure logical-time Lamport clocks. */
var LamportClock = function (processId, initTime) {
    if (!Spec.reTok.test(processId)) {
        throw new Error('invalid process id: '+processId);
    }
    this.id = processId;
    // sometimes we assume our local clock has some offset
    this.seq = 0;
};

LamportClock.prototype.adjustTime = function () {
};

LamportClock.prototype.issueTimestamp = function time () {
    var base = Spec.int2base(this.seq++, 5);
    return base + '+' + this.id;
};

LamportClock.prototype.parseTimestamp = function parse (ts) {
    var m = ts.match(Spec.reTokExt);
    if (!m) {throw new Error('malformed timestamp: '+ts);}
    return {
        seq: Spec.base2int(m[1]),
        process: m[2]
    };
};

/** Lamport partial order  imperfect semi-logical*/
LamportClock.prototype.checkTimestamp = function see (ts) {
    var parsed = this.parseTimestamp(ts);
    if (parsed.seq >= this.seq) {
        this.seq = parsed.seq + 1;
    }
    return true;
};

LamportClock.prototype.time2date = function () {
    return undefined;
};

module.exports = LamportClock;
