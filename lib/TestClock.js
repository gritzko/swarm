"use strict";

var Spec = require('./Spec');

var TestClock = function (processId, timeOffsetMs) {
    if (!Spec.reTok.test(processId)) {
        throw new Error('invalid process id: '+processId);
    }
    this.id = processId;
    // sometimes we assume our local clock has some offset
    this.clockOffsetMs = 0;
    this.lastIssuedTimestamp = '';
    // although we try hard to use wall clock time, we must
    // obey Lamport logical clock rules, in particular our
    // timestamps must be greater than any other timestamps
    // previously seen
    this.lastSeqSeen = 0;
};

TestClock.prototype.adjustTime = function (trueMs) {
};

TestClock.prototype.ms = function () {
    return 0;
};

TestClock.prototype.issueTimestamp = function () {
    var bigseq = Spec.int2base(++this.lastSeqSeen, 5);
    this.lastIssuedTimestamp = bigseq + '+' + this.id;
    return this.lastIssuedTimestamp;
};

TestClock.prototype.parseTimestamp = function parse (ts) {
    var m = ts.match(Spec.reTokExt);
    if (!m) {throw new Error('malformed timestamp: '+ts);}
    var seq=m[1]; //, process=m[2];
    return {
        time: 0,
        seq: Spec.base2int(seq)
    };
};

TestClock.prototype.checkTimestamp = function see (ts) {
    if (ts<this.lastIssuedTimestamp) { return true; }
    var parsed = this.parseTimestamp(ts);
    if (parsed.time===0 && parsed.seq<this.lastSeqSeen) { return true; }
    if (parsed.time>1) { return false; }
    this.lastSeqSeen = parsed.seq;
    return true;
};


module.exports = TestClock;
