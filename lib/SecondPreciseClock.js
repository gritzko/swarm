"use strict";

var Spec = require('./Spec');

/** Swarm is based on the Lamport model of time and events in a
  * distributed system, so Lamport timestamps are essential to
  * its functioning. In most of the cases, it is useful to
  * use actuall wall clock time to create timestamps. This
  * class creates second-precise Lamport timestamps.
  * Timestamp ordering is alphanumeric, length may vary.
  *
  * @param processId id of the process/clock to add to every
  *        timestamp (like !timeseq+gritzko~ssn, where gritzko
  *        is the user and ssn is a session id, so processId
  *        is "gritzko~ssn").
  * @param initTime normally, that is server-supplied timestamp
  *        to init our time offset; there is no guarantee about
  *        clock correctness on the client side
  */
var SecondPreciseClock = function (processId, timeOffsetMs) {
    if (!Spec.reTok.test(processId)) {
        throw new Error('invalid process id: '+processId);
    }
    this.id = processId;
    // sometimes we assume our local clock has some offset
    this.clockOffsetMs = 0;
    this.lastTimestamp = '';
    // although we try hard to use wall clock time, we must
    // obey Lamport logical clock rules, in particular our
    // timestamps must be greater than any other timestamps
    // previously seen
    this.lastTimeSeen = 0;
    this.lastSeqSeen = 0;
    if (timeOffsetMs) {
        this.clockOffsetMs = timeOffsetMs;
    }
};

var epochDate = new Date("Wed, 01 Jan 2014 00:00:00 GMT");
SecondPreciseClock.EPOCH = epochDate.getTime();

SecondPreciseClock.prototype.adjustTime = function (trueMs) {
    var localTime = this.ms();
    var clockOffsetMs = trueMs - localTime;
    this.clockOffsetMs = clockOffsetMs;
    var lastTS = this.lastTimeSeen;
    this.lastTimeSeen = 0;
    this.lastSeqSeen = 0;
    this.lastTimestamp = '';
    if ( this.seconds()+1 < lastTS ) {
        console.error("risky clock reset",this.lastTimestamp);
    }
};

SecondPreciseClock.prototype.ms = function () {
    var millis = new Date().getTime();
    millis -= SecondPreciseClock.EPOCH;
    return millis;
};

SecondPreciseClock.prototype.seconds = function () {
    var millis = this.ms();
    millis += this.clockOffsetMs;
    return (millis/1000) | 0;
};

SecondPreciseClock.prototype.issueTimestamp = function time () {
    var res = this.seconds();
    if (this.lastTimeSeen>res) { res = this.lastTimeSeen; }
    if (res>this.lastTimeSeen) { this.lastSeqSeen = -1; }
    this.lastTimeSeen = res;
    var seq = ++this.lastSeqSeen;
    if (seq>=(1<<12)) {throw new Error('max event freq is 4000Hz');}

    var baseTimeSeq = Spec.int2base(res, 5);
    if (seq>0) { baseTimeSeq+=Spec.int2base(seq, 2); }

    this.lastTimestamp = baseTimeSeq + '+' + this.id;
    return this.lastTimestamp;
};

SecondPreciseClock.rsQTokExt =
    '([/#\\.!\\*])?(={5})(={2})?(?:\\+(={1,80}))?'
    .replace(/=/g, '[0-9A-Za-z_~]');
SecondPreciseClock.reQTokExt = new RegExp(SecondPreciseClock.rsQTokExt);

SecondPreciseClock.parseTimestamp = function parse (ts) {
    var m = ts.match(SecondPreciseClock.rsQTokExt);
    if (!m) {throw new Error('malformed timestamp: '+ts);}
    var time = Spec.base2int(m[2]);
    var seq = m[3] ? Spec.base2int(m[3]) : 0;
    var source = m[4];
    if (seq>=Spec.MAX_SEQ) {
        throw new Error("4000Hz is the limit");
    }
    return {
        time: time,
        seq: seq,
        source: source
    };
};
SecondPreciseClock.prototype.parseTimestamp = SecondPreciseClock.parseTimestamp;

SecondPreciseClock.unparseTimestamp = function unparse (parsed) {
    var baseTimeSeq = Spec.int2base(parsed.time, 5);
    if (parsed.seq>0) { baseTimeSeq+=Spec.int2base(parsed.seq, 2); }
    return baseTimeSeq + '+' + parsed.source;
};
SecondPreciseClock.prototype.unparseTimestamp = SecondPreciseClock.unparseTimestamp;

/** Freshly issued Lamport logical timestamps must be greater than
    any timestamps previously seen. */
SecondPreciseClock.prototype.checkTimestamp = function see (ts) {
    if (ts<this.lastTimestamp) { return true; }
    var parsed = this.parseTimestamp(ts);
    if (parsed.time<this.lastTimeSeen) { return true; }
    var sec = this.seconds();
    if (parsed.time>sec+1) {
        return false; // back to the future
    }
    this.lastTimeSeen = parsed.time;
    this.lastSeqSeen = parsed.seq;
    return true;
};

SecondPreciseClock.prototype.timestamp2date = function (ts) {
    var parsed = this.parseTimestamp(ts);
    var millis = parsed.time * 1000 + SecondPreciseClock.EPOCH;
    return new Date(millis);
};


module.exports = SecondPreciseClock;
