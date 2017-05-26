"use strict";
const Base64x64 = require('./Base64x64');
const ReplicaId = require('./ReplicaId');

/**
 *
 * ![events](https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Vector_Clock.svg/750px-Vector_Clock.svg.png)
 *
 * UID implements Base64 string Lamport timestamps. First described in
 * ["Time, clocks, and the ordering of events in a distributed system"][paper]
 * by Leslie Lamport these timestamps are designed to track events in
 * a distributed system.
 * It describes a model of time based on sequential processes that
 * communicate asynchronously. Each process has its local clocks only,
 * no "newtonian" global universal clocks.
 * Notably, the paper's primary inspiration was the special theory of
 * relativity.
 * These days, Lamport timestamps are used everywhere, starting from
 * multicore CPUs all the way to world-scale distributed systems.
 *
 * Every Lamport timestamp has two components:
 *
 * * monotonically increasing time value and
 * * a globally unique process/clock identifier.
 *
 * This implementation deals with Base64x64 string based timestamps.
 * Base64 can be used inside URLs (path/fragment parts), logs, arbitrary
 * databases, etc.
 *
 * This class defines the timestamp serialization format other classes
 * reuse: `timestamp+replicaId`.
 * Base64x64 time value followed by a separator (plus or minus sign) and
 * a Base64x64 process id. In our case, a "process" is a Swarm
 * db replica (one process runs one replica, owns one clock).
 *
 * Strategies for timestamp generation may differ (see Clock).
 * The only general requirement is the monotonous lexicographic order:
 * a newly issued timestamp must be greater than any past timestamp
 * seen by that replica.
 *
 * [paper]: http://amturing.acm.org/p558-lamport.pdf
 * @class
 */
class UID {

    /**
     * Constructor valid parameters:
     * * new UID("time","origin")
     * * new UID("time-origin")
     * * new UID("transcndnt")
     * * new UID(stamp)
     * * new UID() // zero
     */
    constructor (stamp, origin) {
        this._string = null;
        this._value = Base64x64.toString(stamp||'0');
        this._origin = Base64x64.toString(origin||'0');
    }

    static fromString (string) {
        UID.reTokExt.lastIndex = 0;
        const m = UID.reTokExt.exec(string.toString());
        return m ? new UID(m[1], m[2]) : null;
    }

    get origin () {
        return this._origin;
    }

    get value () {
        return this._value;
    }

    get Value () {
        return new Base64x64(this._value);
    }

    /** ReplicaIdScheme.DEFAULT_SCHEME must be set correctly */
    get Origin () {
        return ReplicaId.fromString(this._origin);
    }

    get date () {
        return this.Value.toDate();
    }

    get seq () {
        return this.Value.seq;
    }

    static now (origin, offset) {
        return new UID( Base64x64.now(offset), origin );
    }

    toString () {
        if (this._string===null) {
            this._string = UID.toString(this._value, this._origin);
        }
        return this._string;
    }

    static toString (time, origin) {
        return time + (origin==='0' ? '' : UID.TIMESTAMP_SEPARATOR + origin);
    }

    static is (str) {
        UID.reTokExt.lastIndex = 0;
        return UID.reTokExt.test(str);
    }

    // Is greater than the other stamp, according to the the lexicographic order
    gt (stamp) {
        if (stamp.constructor!==UID) stamp = UID.as(stamp);
        return this._value > stamp._value ||
            (this._value===stamp._value && this._origin>stamp._origin);
    }

    lt (stamp) {
        if (stamp.constructor!==UID) stamp = UID.as(stamp);
        return !this.gt(stamp) && !this.eq(stamp);
    }

    le (stamp) {
        if (stamp.constructor!==UID) stamp = UID.as(stamp);
        return !this.gt(stamp);
    }

    ge (stamp) {
        if (stamp.constructor!==UID) stamp = UID.as(stamp);
        return !this.lt(stamp);
    }

    eq (stamp) {
        if (stamp.constructor!==UID) stamp = UID.as(stamp);
        if (!stamp) return false;
        return this._value===stamp._value && this._origin===stamp._origin;
    }

    isTranscendent () {
        return this._origin==='0';
    }

    isAbnormal () {
        return Base64x64.isAbnormal(this._value) ||
            Base64x64.isAbnormal(this._origin);
    }

    /** just a timestamp */
    isNormal () {
        return ! this.isTranscendent() && !this.isAbnormal();
    }

    isNever () {
        return this._value===Base64x64.INFINITY;
    }

    isZero () {
        return this._value===Base64x64.zero;
    }

    isError () {
        return this._value===Base64x64.INCORRECT;
    }

    isEmpty () {
        return this._value===Base64x64.zero && this._origin===Base64x64.zero;
    }

    isUpstreamOf (stamp) {
        if (stamp.constructor!==UID) stamp = UID.as(stamp);
        return stamp._origin.length > this._origin.length &&
            stamp._origin.substr(0, this._origin.length) === this._origin;
    }

    isDownstreamOf (stamp) {
        if (stamp.constructor!==UID) stamp = UID.as(stamp);
        return this._origin.length > stamp._origin.length &&
            this._origin.substr(0, stamp._origin.length) === stamp._origin;
    }

    isSameOrigin (stamp) {
        if (stamp.constructor!==UID) stamp = UID.as(stamp);
        return this._origin === stamp._origin;
    }

    next (origin) {
        let val = this.Value;
        return new UID(val.inc().toString(), origin||this._origin);
    }

    static as (val) {
        if (val && val.constructor===UID) {
            return val;
        } else if (!val) {
            return null;
        } else {
            return UID.fromString(val.toString());
        }
    }

    get ms () {
        return this.Value.ms;
    }

}

UID.SEPARATORS = "-+%*";
UID.TIMESTAMP_SEPARATOR = "-";
// TODO waterfall derivation
UID.rsTok = '=(?:[\\+\\-]=)?'.replace(/=/g, Base64x64.rs64x64);
UID.rsTokExt = '(=)(?:[\\+\\-](=))?'.replace(/=/g, Base64x64.rs64x64);
UID.reTokExt = new RegExp('^'+UID.rsTokExt+'$');

UID.zero = Base64x64.zero;
UID.ZERO = new UID(UID.zero);
UID.never = '~';
UID.NEVER = new UID(UID.never);
UID.ERROR = new UID(Base64x64.INCORRECT, '0');


module.exports = UID;
