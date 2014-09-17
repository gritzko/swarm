"use strict";

var Spec = require('./Spec');

/** It is not always necessary to have second-precise timestamps.
  * Going with minute-precise allows to fit timestamp values
  * into 30 bits (5 base64, 2 unicode chars).
  * More importantly, such timestamps increase incrementally for
  * short bursts of events (e.g. user typing). That allows
  * for sequence-coding optimizations in LongSpec.
  * In case processes generate more than 64 events a minute,
  * which is not unlikely, the optimization fails as we add
  * 12-bit seq (2 base64, 1 unicode). */
var MinutePreciseClock = function (processId, initTime) {
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
    this.lastTimeSeen = 0;
    this.lastSeqSeen = 0;
    if (initTime) {
        var time = this.parseTimestamp(initTime);
        var myMinutes = this.minutes();
        // TODO rework. need milliseconds from the server.
        this.clockOffsetMs = (time.minutes - myMinutes) * 60*1000;
        this.seeTimestamp(initTime);
    }
};

var epochDate = new Date(2014,0,1);
MinutePreciseClock.EPOCH = epochDate.getTime();

MinutePreciseClock.prototype.minutes = function () {
    var millis = new Date().getTime();
    millis -= MinutePreciseClock.EPOCH;
    millis += this.clockOffsetMs;
    return (millis/60000) | 0;
};

MinutePreciseClock.prototype.issueTimestamp = function () {
    var time = this.minutes();
    if (this.lastTimeSeen>time) { time = this.lastTimeSeen; }
    if (time>this.lastTimeSeen) { this.lastSeqSeen = -1; }
    this.lastTimeSeen = time;
    var seq = ++this.lastSeqSeen;
    if (seq>=(1<<18)) {throw new Error('max event freq is 4000Hz');}

    var baseTime = Spec.int2base(time, 4), baseSeq;
    if (seq<64) {
        baseSeq = Spec.int2base(seq, 1);
    } else {
        baseSeq = Spec.int2base(seq, 3);
    }

    this.lastIssuedTimestamp = baseTime + baseSeq + '+' + this.id;
    return this.lastIssuedTimestamp;
};

MinutePreciseClock.prototype.parseTimestamp = function parse (ts) {
    var m = ts.match(Spec.reTokExt);
    if (!m) {throw new Error('malformed timestamp: '+ts);}
    var timeseq=m[1]; //, process=m[2];
    var time = timeseq.substr(0,4), seq = timeseq.substr(4);
    if (seq.length!==1 && seq.length!==3) {
        throw new Error('malformed timestamp value: '+timeseq);
    }
    return {
        time: Spec.base2int(time),
        seq: Spec.base2int(seq)
    };
};

/** Lamport partial order  imperfect semi-logical*/
MinutePreciseClock.prototype.seeTimestamp = function see (ts) {
    if (ts<this.lastIssuedTimestamp) { return; }
    var parsed = this.parseTimestamp(ts);
    this.lastTimeSeen = parsed.time;
    this.lastSeqSeen = parsed.seq;
};


MinutePreciseClock.prototype.time2date = function () {
    // parse etc
};

module.exports = MinutePreciseClock;
