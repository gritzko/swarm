"use strict";
var Base64x64 = require('./Base64x64');

/**
 * This class defines the general timestamp format all the *clock* classes
 * must generate: `timestamp+replica`. It is based on the
 * idea of [Logical timestamp][lamport]: time value followed by a process
 * id. Both timestamp and process id are Base64x64, `+` is a separator.
 * In our case, a "process" is a Swarm db replica.
 *
 * The precise meaning of the time part is clock-specific (see Clock).
 * It may be a pure logical timestamp (incremental) or it may convey
 * the actual wall clock time. The only general requirement is the
 * lexicographic order: a newly issued timestamp must be greater than
 * anything previously seen.
 *
 * [lamport]: http://research.microsoft.com/en-us/um/people/lamport/pubs/time-clocks.pdf
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
        if (origin) {
            if (stamp.constructor===String) {
                this._value = Base64x64.toString(stamp);
            } else if (stamp.constructor===Date) {
                this._parsed = new Base64x64(stamp);
                this._value = this._parsed.toString();
            } else if (stamp.constructor===Stamp) {
                this._value = stamp._value;
            } else if (stamp.constructor===Base64x64) {
                this._value = stamp.toString();
                this._parsed = stamp;
            } else {
                throw new Error("unrecognized value");
            }
            this._origin = Base64x64.toString(origin);
        } else if (stamp) {
            if (stamp.constructor===Stamp) {
                this._value = stamp._value;
                this._origin = stamp._origin;
            } else {
                Stamp.reTokExt.lastIndex = 0;
                var m = Stamp.reTokExt.exec(stamp);
                if (!m) {
                    throw new Error('malformed Lamport timestamp');
                }
                this._value = Base64x64.toString(m[1]);
                this._origin = m[2] ? Base64x64.toString(m[2]) : '0';
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
        return this._value + (this._origin==='0' ? '' : '+' + this._origin);
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
        return new Stamp(val.inc(), origin||this._origin);
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

Stamp.rsTokExt = '(=)(?:\\+(=))?'.replace(/=/g, Base64x64.rs64x64);
Stamp.reTokExt = new RegExp('^'+Stamp.rsTokExt+'$');

Stamp.ZERO = new Stamp('0');
Stamp.NEVER = new Stamp('~');

module.exports = Stamp;
