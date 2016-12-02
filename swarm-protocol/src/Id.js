"use strict";
const Base64x64 = require('./Base64x64');
const ReplicaId = require('./ReplicaId');

/**
 *
 * ![events](https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Vector_Clock.svg/750px-Vector_Clock.svg.png)
 *
 * Id implements Base64 string Lamport timestamps. First described in
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
class Id {

    /**
     * Constructor valid parameters:
     * * new Id("time","origin")
     * * new Id("time-origin")
     * * new Id("transcndnt")
     * * new Id(stamp)
     * * new Id() // zero
     */
    constructor (stamp, origin) {
        this._parsed = null;
        this._rid = null;
        this._string = null;
        if (origin) {
            this._value = Base64x64.toString(stamp);
            this._origin = Base64x64.toString(origin);
        } else if (stamp) {
            if (stamp.constructor===Id) {
                this._value = stamp._value;
                this._origin = stamp._origin;
                this._string = stamp._string;
            } else {
                Id.reTokExt.lastIndex = 0;
                var m = Id.reTokExt.exec(stamp.toString());
                if (m) {
                    this._string = m[0];
                    this._value = Base64x64.toString(m[1]);
                    this._origin = m[2] ? Base64x64.toString(m[2]) : '0';
                } else {
                    this._value = Base64x64.INCORRECT;
                    this._origin = '0';
                }
            }
        } else {
            this._value = this._origin = '0';
        }
    }

    get origin () {
        return this._origin;
    }

    get value () {
        return this._value;
    }

    get Value () {
        if (this._parsed===null) {
            this._parsed = new Base64x64(this._value);
        }
        return this._parsed;
    }

    /** ReplicaIdScheme.DEFAULT_SCHEME must be set correctly */
    get Origin () {
        if (this._rid === null)
            this._rid = ReplicaId.fromString(this._origin);
        return this._rid;
    }

    get date () {
        return this.Value.toDate();
    }

    get seq () {
        return this.Value.seq;
    }

    static now (origin, offset) {
        return new Id( Base64x64.now(offset), origin );
    }

    toString () {
        if (this._string===null) {
            this._string = Id.toString(this._value, this._origin);
        }
        return this._string;
    }

    static toString (time, origin) {
        return time + (origin==='0' ? '' : '-' + origin);
    }

    static is (str) {
        Id.reTokExt.lastIndex = 0;
        return Id.reTokExt.test(str);
    }

    // Is greater than the other stamp, according to the the lexicographic order
    gt (stamp) {
        var s = stamp.constructor===Id ? stamp : new Id(stamp);
        return this._value > s._value ||
            (this._value===s._value && this._origin>s._origin);
    }

    lt (stamp) {
        var s = stamp.constructor===Id ? stamp : new Id(stamp);
        return this._value < s._value ||
            (this._value===s._value && this._origin<s._origin);
    }

    le (stamp) {
        return !this.gt(stamp);
    }

    ge (stamp) {
        return !this.lt(stamp);
    }

    eq (stamp) {
        if (!stamp) return false;
        const id = Id.as(stamp);
        return this._value===id._value && this._origin===id._origin;
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

    static to (value) {
        return value && value.constructor===Id ?
            value : new Id(value);
    }

    isUpstreamOf (stamp) {
        let s = Id.to(stamp);
        return s._origin.length > this._origin.length &&
            s._origin.substr(0, this._origin.length) === this._origin;
    }

    isDownstreamOf (stamp) {
        let s = Id.to(stamp);
        return this._origin.length > s._origin.length &&
            this._origin.substr(0, s._origin.length) === s._origin;
    }

    isSameOrigin (stamp) {
        let s = Id.to(stamp);
        return this._origin === s._origin;
    }

    next (origin) {
        let val = this.Value;
        return new Id(val.inc().toString(), origin||this._origin);
    }

    static as (val) {
        if (val && val.constructor===Id) {
            return val;
        } else {
            return new Id(val.toString());
        }
    }

    get ms () {
        return this.Value.ms;
    }

}

Id.rsTok = '=(?:[\\+\\-]=)?'.replace(/=/g, Base64x64.rs64x64);
Id.rsTokExt = '(=)(?:[\\+\\-](=))?'.replace(/=/g, Base64x64.rs64x64);
Id.reTokExt = new RegExp('^'+Id.rsTokExt+'$');

Id.zero = Base64x64.zero;
Id.ZERO = new Id(Id.zero);
Id.never = '~';
Id.NEVER = new Id(Id.never);
Id.ERROR = new Id(Base64x64.INCORRECT, '0');

module.exports = Id;
