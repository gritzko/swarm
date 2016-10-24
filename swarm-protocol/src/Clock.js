"use strict";
var Base64x64 = require('./Base64x64');
var Stamp = require('./Stamp');

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
class Clock {

    constructor (origin, meta_options) {
        this._last = Stamp.ZERO;
        if (!Base64x64.is(origin))
            throw new Error('invalid origin');
        this._origin = origin.toString();
        this._offset = 0;
        this._minlen = 6;
        this._logical = false;
        let options = this._options = meta_options || Object.create(null);
        if (options.Clock) {
            this._logical = options[Clock.OPTION_CLOCK_MODE]==='Logical';
        }
        if (options.ClockLen) {
            this._minlen = options[Clock.OPTION_CLOCK_LENGTH];
        }
        if (options.ClockOffst) {
            this._offset = parseInt(options.ClockOffst);
        }
        if (options.ClockLast) {
            this._last = new Stamp(options.ClockLast);
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
            new Stamp(this._last.Value.next(this._minlen), this._origin) :
            Stamp.now(this._origin, this._offset);
        var last = this._last;
        if (!next.gt(last)) {// either seq++ or stuck-ahead :(
            next = last.next(this._origin);
        } else if (this._minlen<8) { // shorten?
            next = new Stamp (
                next.Value.relax(last.value, this._minlen),
                this._origin
            );
        }
        this._last = next;
        return next;
    }

    time () {
        return this.issueTimestamp();
    }

    get lastStamp () {
        return this._last;
    }

    seeTimestamp (stamp) {
        stamp = Stamp.as(stamp);
        if (stamp.gt(this._last)) {
            this._last = stamp;
        }
    }

}

Clock.OPTION_CLOCK_LENGTH = "ClockLen";
Clock.OPTION_CLOCK_MODE = "Clock";

module.exports = Clock;
