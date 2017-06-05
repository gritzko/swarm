"use strict";
var Base64x64 = require('./Base64x64');
var UUID = require('./UUID');

/**  Swarm is based on the Lamport model of time and events in a
 * distributed system, so Lamport logical timestamps are essential
 * to its functioning. Still, in most of the cases, it is useful
 * to know the actual wall clock time of an event.
 * Hence, we use logical timestamps that match the wall clock time
 * numerically. A similar approach was termed "hybrid timestamps"
 * in http://www.cse.buffalo.edu/tech-reports/2014-04.pdf.
 * MTproto employs some variety of plausible timestamps.
 * Unfortunately, we can not rely on client-side NTP, so our
 * approach differs in some subtle but critical ways.
 * The correct Swarm time is mostly dictated from upstream
 * to downstream replicas, recursively. As long as the
 * local clock has a reasonable skew, replicas can
 * produce correct timestamps while being offline (temporarily).
 * This borrows from the LEDBAT approach (good skew is enough).
 *
 * Again, this is logical clock that tries to be as close to
 * wall clock as possible, so downstream replicas may
 * intentionally lag behind the astronomic time a little bit just
 * to ensure they don't run ahead. The magnitude of such effects
 * is bounded by RTT (round trip time).
 *
 * The format of a timestamp is calendar-friendly.
 * Separate base64 characters denote UTC month (since Jan 2010),
 * date, hour, minute, second and millisecond, plus two
 * chars for a sequence number: `MMDHmSssii`. Every base64 char is
 * 6 bits, but date (1-31) and hour (0-23) chars waste 1 bit each,
 * while the first millisecond char wastes 2 bits.
 * So, a timestamp has 56 meaningful bits in 10 base64 chars.
 *
 * We don't always need full 11 chars of a timestamp, so the class
 * produces Lamport timestamps of adaptable length, 5 to 11 chars,
 * depending on the actual event frequency. For the goals of
 * comparison, missing chars are interpreted as zeros.
 * The most common length is 6 chars (second-precise).
 * The alphanumeric order of timestamps is correct, thanks to
 * our custom version of base64 (01...89AB...YZ_ab...yz~).
 *
 * @class
 * @param now
 * @param options
 */
class Clock {

    constructor (origin, meta_options) {
        this.op = UUID.ZERO;
        if (!Base64x64.is(origin))
            throw new Error('invalid origin');
        this._origin = origin.toString();
        this._offset = 0;
        this._minlen = 6;
        this._logical = false;
        const options = this._options = meta_options || Object.create(null);
        this._logical = options[Clock.OPTION_CLOCK_MODE]==='Logical';
        if (options.ClockLen) {
            this._minlen = options[Clock.OPTION_CLOCK_LENGTH]; // TODO refac
        }
        if (options.ClockOffst) {
            this._offset = parseInt(options.ClockOffst);
        }
        if (options.ClockLast) {
            this.op = new UUID(options.ClockLast);
        }
        if (options.ClockNow) {
            let now = parseInt(options.ClockNow);
            let mynow = Date.now();
            this._offset = now - mynow;
        }
    }

    get origin () {
        return this._origin;
    }

    issueTimestamp () {
        var next = this._logical ?
            new UUID(this.op.Value.next(this._minlen), this._origin) :
            UUID.now(this._origin, this._offset);
        var last = this.op;
        if (!next.gt(last)) {// either seq++ or stuck-ahead :(
            next = last.next(this._origin);
        } else if (this._minlen<8) { // shorten?
            next = new UUID (
                next.Value.relax(last.value, this._minlen),
                this._origin
            );
        }
        this.op = next;
        return next;
    }

    time () {
        return this.issueTimestamp();
    }

    get lastId () {
        return this.op;
    }

    seeTimestamp (stamp) {
        stamp = UUID.as(stamp);
        if (stamp.gt(this.op)) {
            this.op = stamp;
        }
    }

}

Clock.OPTION_CLOCK_LENGTH = "ClockLen";
Clock.OPTION_CLOCK_MODE = "ClockMode";

module.exports = Clock;
