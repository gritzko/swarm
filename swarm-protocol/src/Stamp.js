"use strict";
var Base64x64 = require('./Base64x64');

/**
 *
 * ![events](https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Vector_Clock.svg/750px-Vector_Clock.svg.png)
 *
 * Stamp implements Base64 string Lamport timestamps. First described in
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
 * Base64x64 time value followed by a separator (the plus sign) and
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
class Stamp {

    /**
     * Constructor valid parameters:
     * * new Stamp("time","origin")
     * * new Stamp("time+origin")
     * * new Stamp("transcndnt")
     * * new Stamp(stamp)
     * * new Stamp() // zero
     */
    constructor (stamp, origin) {
        this._parsed = null;
        this._string = null;
        if (origin) {
            this._value = Base64x64.toString(stamp);
            this._origin = Base64x64.toString(origin);
        } else if (stamp) {
            if (stamp.constructor===Stamp) {
                this._value = stamp._value;
                this._origin = stamp._origin;
                this._string = stamp._string;
            } else {
                Stamp.reTokExt.lastIndex = 0;
                var m = Stamp.reTokExt.exec(stamp.toString());
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
    
    get date () {
        return this.Value.toDate();
    }

    get seq () {
        return this.Value.seq;
    }

    static now (origin, offset) {
        return new Stamp( Base64x64.now(offset), origin );
    }

    toString () {
        return this.string;
    }

    static toString (time, origin) {
        return time + (origin==='0' ? '' : '+' + origin);
    }

    get string () {
        if (this._string===null) {
            this._string = Stamp.toString(this._value, this._origin);
        }
        return this._string;
    }

    static is (str) {
        Stamp.reTokExt.lastIndex = 0;
        return Stamp.reTokExt.test(str);
    }

    // Is greater than the other stamp, according to the the lexicographic order
    gt (stamp) {
        var s = stamp.constructor===Stamp ? stamp : new Stamp(stamp);
        return this._value > s._value ||
            (this._value===s._value && this._origin>s._origin);
    }

    lt (stamp) {
        var s = stamp.constructor===Stamp ? stamp : new Stamp(stamp);
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
        var s = stamp.constructor===Stamp ? stamp : new Stamp(stamp);
        return this._value===s._value && this._origin===s._origin;
    }

    isTranscendent () {
        return this._origin==='0';
    }

    isAbnormal () {
        return this._value.charAt(0)==='~';
    }

    isNever () {
        return this._value===Base64x64.INFINITY;
    }

    isZero () {
        return this._value===Base64x64.ZERO;
    }

    isError () {
        return this._value===Base64x64.INCORRECT;
    }

    isEmpty () {
        return this._value===Base64x64.ZERO && this._origin===Base64x64.ZERO;
    }

    static to (value) {
        return value && value.constructor===Stamp ?
            value : new Stamp(value);
    }

    isUpstreamOf (stamp) {
        let s = Stamp.to(stamp);
        return s._origin.length > this._origin.length &&
            s._origin.substr(0, this._origin.length) === this._origin;
    }

    isDownstreamOf (stamp) {
        let s = Stamp.to(stamp);
        return this._origin.length > s._origin.length &&
            this._origin.substr(0, s._origin.length) === s._origin;
    }

    isSameOrigin (stamp) {
        let s = Stamp.to(stamp);
        return this._origin === s._origin;
    }

    next (origin) {
        let val = this.Value;
        return new Stamp(val.inc().toString(), origin||this._origin);
    }

    static as (val) {
        if (val && val.constructor===Stamp) {
            return val;
        } else {
            return new Stamp(val);
        }
    }

    get ms () {
        return this.Value.ms;
    }

}

Stamp.rsTok = '=(?:\\+=)?'.replace(/=/g, Base64x64.rs64x64);
Stamp.rsTokExt = '(=)(?:[+-](=))?'.replace(/=/g, Base64x64.rs64x64);
Stamp.reTokExt = new RegExp('^'+Stamp.rsTokExt+'$');

Stamp.zero = '0';
Stamp.ZERO = new Stamp(Stamp.zero);
Stamp.never = '~';
Stamp.NEVER = new Stamp(Stamp.never);
Stamp.ERROR = new Stamp(Base64x64.INCORRECT, '0');

module.exports = Stamp;
