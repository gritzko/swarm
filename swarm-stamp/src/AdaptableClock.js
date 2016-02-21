"use strict";

var base64 = require('./base64');
var LamportTimestamp = require('./LamportTimestamp');

/** Swarm is based on the Lamport model of time and events in a
  * distributed system, so Lamport timestamps are essential to
  * its functioning. In most of the cases, it is useful to
  * use actual wall clock time to create timestamps. This
  * class creates Lamport timestamps of adaptable length,
  * depending on event frequency
  * XXX.
  * Timestamp ordering is alphanumeric, length may vary.
  * @class
  * @param
  */
function AdaptableClock (now, options) {
    var start = new LamportTimestamp(now);
    this.origin = start.origin();
    this.offset_ms = 0;
    this.last_issued_time = '';
    this.last_issued_stamp = '';
    this.shorter = 0;
    this.seq = 0;
    this.shorten_counts = 0;
    if (options && options.offline) {
        if (options.offset_ms) {
            this.offset_ms = options.offset_ms;
        }
        !start.isZero() && this.seeTimestamp(now, AdaptableClock.UPSTREAM);
    } else {
        !start.isZero() && this.seeTimestamp(now, AdaptableClock.UPSTREAM_EXACT);
    }
}
module.exports = AdaptableClock;
AdaptableClock.UPSTREAM = 1;
AdaptableClock.EXACT = 2;
AdaptableClock.UPSTREAM_EXACT = 1|2;

/** Returns our version of milliseconds-since-epoch. */
AdaptableClock.prototype.ms = function () {
    return Date.now() + this.offset_ms;
};

/** Returns a full unique 12-char time string. */
AdaptableClock.prototype.time = function () {
    var _64 = base64.base64;
    var date = new Date(this.ms());
    var month = (date.getUTCFullYear()-2010)*12 + date.getUTCMonth();
    var full = base64.int2base(month,2);
    full += _64[date.getUTCDate()];
    full += _64[date.getUTCHours()];
    full += _64[date.getUTCMinutes()];
    full += _64[date.getUTCSeconds()];
    full += base64.int2base(date.getUTCMilliseconds(), 2);
    return full;
};

/**
  * @param options.precise don't abbreviate, use millisecond-precise time
  * @param options.random additionally randomize the timestamp
  */
AdaptableClock.prototype.issueTimestamp = function (options) {
    var time = this.time(), ret = time; // first, get the full form for the date
    if ( this.last_issued_time > time ) {// stuck-ahead
        // can only add seq
        time = this.last_issued_time;
        ret = time + base64.int2base(++this.seq, 4);
        // FIXME seq in the 1st run
    } else if ( this.last_issued_time === time ) {// same millisecond
        ret += base64.int2base(++this.seq, 2);
        // TODO shorten!!
    } else if (options && options.precise) {
        this.seq = 0; // FIXME WAT?!!
    } else { // shorten! (we prefer shorter stamps, right?)
        this.seq = 0;
        var unique = 5;
        while (ret.substr(0,unique)===this.last_issued_stamp.substr(0,unique)) {
            unique++;
        }
        if (unique<this.last_issued_stamp.length) {// optimize for uniform lengths
            if (++this.shorter>1) {
                unique = this.last_issued_stamp.length-1;
                this.shorter = 0;
            }
        }
        ret = ret.substr(0,unique);
    }
    this.last_issued_time = time;
    this.last_issued_stamp = ret;
    return new LamportTimestamp(ret, this.origin);
};

/** Parse a timestamp (issued by an AdaptableClock). */
AdaptableClock.parseTimestamp = function (ts) {
    var lamp = new LamportTimestamp(ts);
    if (lamp.isZero()) {

    }
    if (lamp.time().length<5) { // FIXME full expansion, flexible - add 0s ?
        throw new Error('not an adaptable stamp');
    }
    var time = lamp.time();
    var month =  base64.base2int(time.substr(0,2)),
        day =    base64.base2int(time[2]),
        hour =   base64.base2int(time[3]),
        minute = base64.base2int(time[4]),
        second = time.length>5 ? base64.base2int(time[5]) : 0,
        ms =     time.length>=8 ? base64.base2int(time.substr(6,2)) : 0, // FIXME half-ms
        seq =    time.length>=10 ? base64.base2int(time.substr(8,2)) : 0; // FIXME half-seq
    return {
        time:   time,
        origin: lamp.origin(),
        date:   new Date(Date.UTC(2010+Math.floor(month/12), month%12, day, hour, minute, second, ms)),
        seq:    seq
    };
};

/**
 * @param trust whether the timestamp is UPSTREAM (bit 1) and/or exact (bit 2)
 * @param stamp the timestamp to see
 */
AdaptableClock.prototype.seeTimestamp = function (stamp, trust) {
    var lamp = new LamportTimestamp(stamp);
    var time = lamp.time();
    if (lamp.isZero()) { return; }
    if (!trust && time<=this.last_issued_stamp) { return true; }
    var my_now = this.time();
    if (!trust && time<=my_now) { return true; }
    // OK, some action may be needed
    if ((trust&AdaptableClock.UPSTREAM) && time>my_now) {// we lag behind
        var parsed = AdaptableClock.parseTimestamp(lamp);
        this.offset_ms = parsed.date.getTime() - this.ms();
    } else if (trust===AdaptableClock.UPSTREAM_EXACT && time!==my_now) { // we run ahead FIXME
        parsed = AdaptableClock.parseTimestamp(lamp);
        this.offset_ms = parsed.date.getTime() - this.ms();
        // this does not touch last_issued_stamp, so that one may be in the future now
    } else if (!trust && time>my_now) { // somebody runs ahead; tell them
        return false;
    } else {
        return true;
    }
};
