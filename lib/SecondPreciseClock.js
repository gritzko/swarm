var Spec = require('./Spec');

/** Swarm is based on the Lamport model of time and events in a
  * distributed system, so Lamport timestamps are essential to
  * its functioning. In most of the cases, it is useful to
  * use actuall wall clock time to create timestamps. This
  * class creates second-precise Lamport timestamps.
  *
  * @param processId id of the process/clock to add to every
  *        timestamp (like !timeseq+gritzko~ssn, where gritzko
  *        is the user and ssn is a session id, so processId
  *        is "gritzko~ssn").
  * @param initTime normally, that is server-supplied timestamp
  *        to init our time offset; there is no guarantee about
  *        clock correctness on the client side
  */
var SecondPreciseClock = function (processId, initTime) {
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
        var mySeconds = this.seconds();
        this.clockOffsetMs = (time.seconds - mySeconds) * 1000;
        this.seeTimestamp(initTime);
        // TODO use min historical offset
    }
};

SecondPreciseClock.EPOCH = 1262275200000; // 1 Jan 2010 (milliseconds)

SecondPreciseClock.prototype.seconds = function () {
    var millis = new Date().getTime();
    millis -= SecondPreciseClock.EPOCH;
    millis += this.clockOffsetMs;
    return (millis/1000) | 0;
};

SecondPreciseClock.prototype.issueTimestamp = function time () {
    var time = this.seconds();
    if (this.lastTimeSeen>time) { time = this.lastTimeSeen; }
    if (time>this.lastTimeSeen) { this.lastSeqSeen = -1; }
    this.lastTimeSeen = time;
    var seq = ++this.lastSeqSeen;
    if (seq>=(1<<12)) {throw new Error('max event freq is 4000Hz');}

    var baseTimeSeq = Spec.int2base(time, 5);
    if (seq>0) { baseTimeSeq+=Spec.int2base(seq, 2); }

    this.lastIssuedTimestamp = baseTimeSeq + '+' + this.id;
    return this.lastIssuedTimestamp;
};

//SecondPreciseClock.reQTokExt = new RegExp(Spec.rsTokExt); // no 'g'

SecondPreciseClock.prototype.parseTimestamp = function parse (ts) {
    var m = ts.match(Spec.reTokExt);
    if (!m) {throw new Error('malformed timestamp: '+ts);}
    var timeseq=m[1], process=m[2];
    var time = timeseq.substr(0,5), seq = timeseq.substr(5);
    if (seq&&seq.length!==2) {
        throw new Error('malformed timestamp value: '+timeseq);
    }
    return {
        time: Spec.base2int(time),
        seq: seq ? Spec.base2int(seq) : 0
    };
};

/** Freshly issued Lamport logical tiemstamps must be greater than
    any timestamps previously seen. */
SecondPreciseClock.prototype.seeTimestamp = function see (ts) {
    if (ts<this.lastIssuedTimestamp) { return; }
    var parsed = this.parseTimestamp(ts);
    this.lastTimeSeen = parsed.time;
    this.lastSeqSeen = parsed.seq;
};


module.exports = SecondPreciseClock;
