"use strict";

var base64 = require('./base64');
var LamportTimestamp = require('./LamportTimestamp');

/**  Swarm is based on the Lamport model of time and events in a
 * distributed system, so Lamport logical timestamps are essential
 * to its functioning. Still, in most of the cases, it is useful
 * to know the actual wall clock time of an event.
 * Hence, we use logical timestamps that match the wall clock time
 * numerically. A similar approach was termed "hybrid timestamps"
 * in http://www.cse.buffalo.edu/tech-reports/2014-04.pdf.
 * Unfortunately, we can not rely on client-side NTP, so our
 * approach differs in some subtle but critical ways.
 * The correct Swarm time is mostly dictated from upstream
 * to downstream replicas, recursively. We only expect
 * local clocks to have some reasonable skew, so replicas can
 * produce correct timestamps while being offline (temporarily).
 *
 * Again, this is logical clock that tries to be as close to
 * wall clock as possible, so downstream replicas may
 * intentionally lag behind the astronomic time a little bit just
 * to ensure they don't run ahead. The magnitude of such effects
 * is bounded by RTT (round trip time).
 *
 * The format of a timestamp is calendar-friendly.
 * Separate base64 characters denote UTC month (since Jan 2010),
 * date, hour, minute, second and millisecond, plus three base64
 * chars for a sequence number: `MMDHmSssiii`. Every base64 char is
 * 6 bits, but date (1-31) and hour (0-23) chars waste 1 bit each,
 * so a timestamp has 64 meaningful bits in 11 base64 chars.
 *
 * We don't always need full 11 chars of a timestamp, so the class
 * produces Lamport timestamps of adaptable length, 5 to 11 chars,
 * depending on the actual event frequency. For the goals of
 * comparison, missing chars are interpreted as zeros.
 * The alphanumeric order of timestamps is correct, thanks to
 * our custom version of base64 (01...89AB...YZ_ab...yz~).
 *
 * @class
 * @param now
 * @param options
 */
function AdaptableClock (now, options) {
    options = options || {};
    var start = new LamportTimestamp(now);
    this.origin = start.origin();
    this.min_length = options.min_length || 5;
    this.offset_ms = 0;
    this.last_issued_time = '';
    this.last_issued_stamp = '';
    this.shorter = 0;
    this.seq = 0;
    this.shorten_counts = 0;
    if (options.offline) {
        if (options.offset_ms) {
            this.offset_ms = options.offset_ms;
        }
        if (!start.isZero()) {
            this.seeTimestamp(now, AdaptableClock.UPSTREAM);
        }
    } else {
        if (!start.isZero()) {
            this.seeTimestamp(now, AdaptableClock.UPSTREAM_EXACT);
        }
    }
}
module.exports = AdaptableClock;
AdaptableClock.UPSTREAM = 1; // FIXME move to LamportClock
AdaptableClock.EXACT = 2;
AdaptableClock.UPSTREAM_EXACT = 1|2;

/** Returns our version of milliseconds-since-epoch. */
AdaptableClock.prototype.ms = function () {
    return Date.now() + this.offset_ms;
};

/** Returns a full unique 8-char time string (no sequence number). */
AdaptableClock.time_str = function (ms) {
    var _64 = base64.base64;
    var date = new Date(ms);
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
  * @param options.precise don't abbreviate, use 8 or 11 chars
  * TODO @param options.random additionally randomize the timestamp
  */
AdaptableClock.prototype.issueTimestamp = function (options) {
    var time = AdaptableClock.time_str(this.ms()), ret = time;
    if ( this.last_issued_time > time ) {// stuck-ahead
        // can only add seq
        time = this.last_issued_time;
        ret = time + base64.int2base(++this.seq, 3);
    } else if ( this.last_issued_time === time ) {// same millisecond
        ret += base64.int2base(++this.seq, 3);
    } else if (options && options.precise) {
        this.seq = 0; // new millisecond, we don't want to shorten it
    } else { // shorten! (we prefer shorter stamps, right?)
        this.seq = 0;
        var unique = this.min_length;
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
        return { time: '0', origin: lamp.origin(), date:null, seq:0 };
    }
    var time = lamp.time();
    while (time.length<11) {
        time = time + '0';
    }
    var month =  base64.base2int(time.substr(0,2)),
        day =    base64.base2int(time[2]),
        hour =   base64.base2int(time[3]),
        minute = base64.base2int(time[4]),
        second = base64.base2int(time[5]),
        ms =     base64.base2int(time.substr(6,2)),
        seq =    base64.base2int(time.substr(8,3));
    return {
        time:   time,
        origin: lamp.origin(),
        date:   new Date(Date.UTC(2010+Math.floor(month/12), month%12,
                    day, hour, minute, second, ms)),
        seq:    seq
    };
};

/**
 * @param trust whether the timestamp is UPSTREAM (bit 1) and/or exact (bit 2)
 * @param stamp the timestamp to see
 */
AdaptableClock.prototype.seeTimestamp = function (stamp, trust) {
    var lamp = new LamportTimestamp(stamp);
    if (lamp.isZero()) { return; }
    var time = lamp.time();
    if (!trust && time<=this.last_issued_stamp) {
        return true; // it is OK, it is in the past
    }
    var my_ms = this.ms();
    var my_now = AdaptableClock.time_str(my_ms);
    if (!trust && time<=my_now) {
        return true; // yes, past
    }
    // OK, some action may be needed
    if ((trust&AdaptableClock.UPSTREAM) && time>my_now) {// we lag behind
        var parsed = AdaptableClock.parseTimestamp(lamp);
        this.offset_ms = parsed.date.getTime() - my_ms;
    } else if (trust===AdaptableClock.UPSTREAM_EXACT && time!==my_now) {
        // we run ahead
        parsed = AdaptableClock.parseTimestamp(lamp);
        this.offset_ms = parsed.date.getTime() - my_ms;
        this.seq = parsed.seq;
        // this does not touch last_issued_stamp, so that one may be in the future now
    } else if (!trust && time>my_now) {
        // somebody runs ahead; tell them so
        return false;
    } else {
        return true;
    }
};
