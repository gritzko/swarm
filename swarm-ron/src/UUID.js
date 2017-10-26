"use strict";
const Base64x64 = require('./Base64x64');
const ReplicaId = require('./ReplicaId');
const RON_GRAMMAR = require('./Grammar');
const uuid = require('uuid');

/**
 *
 * ![events](https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Vector_Clock.svg/750px-Vector_Clock.svg.png)
 *
 * UUID implements Base64 string Lamport timestamps. First described in
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
class UUID {

    /**
     * Constructor valid parameters:
     * * new UUID("time","origin")
     * * new UUID("time-origin")
     * * new UUID("transcndnt")
     * * new UUID(stamp)
     * * new UUID() // zero
     */
    constructor (stamp, origin) {
        this._string = null;
        this._value = Base64x64.toString(stamp||'0');
        this._origin = Base64x64.toString(origin||'0');
    }

    static fromString (string, default_uuid) {
        const def = UUID.as(default_uuid) || UUID.ZERO;
        if (!string) return def || UUID.ERROR;
        const parts = RON_GRAMMAR.split(string, "ZIP_UUID");
        if (!parts) return UUID.ERROR;
        if (parts[0] && '`\\|/'.indexOf(parts[0][0])!==-1)
            parts[0] = parts[0].substr(1); // FIXME separate capture group
        return new UUID(
            Base64x64.fromString(parts[0], def.time),
            Base64x64.fromString(parts[1], def.origin)
        );
    }

    get origin () {
        return this._origin;
    }

    get time () {
        return this._value;
    }

    get Time () {
        return new Base64x64(this._value);
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
        return new UUID( Base64x64.now(offset), origin );
    }

    toString () {
        if (this._string===null) {
            this._string = UUID.toString(this._value, this._origin);
        }
        return this._string;
    }

    static toString (time, origin) {
        return time + (origin==='0' ? '' : UUID.TIMESTAMP_SEPARATOR + origin);
    }

    // Is greater than the other stamp, according to the the lexicographic order
    gt (stamp) {
        if (stamp.constructor!==UUID) stamp = UUID.as(stamp);
        return this._value > stamp._value ||
            (this._value===stamp._value && this._origin>stamp._origin);
    }

    lt (stamp) {
        if (stamp.constructor!==UUID) stamp = UUID.as(stamp);
        return !this.gt(stamp) && !this.eq(stamp);
    }

    le (stamp) {
        if (stamp.constructor!==UUID) stamp = UUID.as(stamp);
        return !this.gt(stamp);
    }

    ge (stamp) {
        if (stamp.constructor!==UUID) stamp = UUID.as(stamp);
        return !this.lt(stamp);
    }

    eq (stamp) {
        if (stamp.constructor!==UUID) stamp = UUID.as(stamp);
        if (!stamp) return false;
        return this._value===stamp._value && this._origin===stamp._origin;
    }

    equals (stamp) { return this.eq(stamp); }

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
        if (stamp.constructor!==UUID) stamp = UUID.as(stamp);
        return stamp._origin.length > this._origin.length &&
            stamp._origin.substr(0, this._origin.length) === this._origin;
    }

    isDownstreamOf (stamp) {
        if (stamp.constructor!==UUID) stamp = UUID.as(stamp);
        return this._origin.length > stamp._origin.length &&
            this._origin.substr(0, stamp._origin.length) === stamp._origin;
    }

    isSameOrigin (stamp) {
        if (stamp.constructor!==UUID) stamp = UUID.as(stamp);
        return this._origin === stamp._origin;
    }

    next (origin) {
        let val = this.Value;
        return new UUID(val.inc().toString(), origin||this._origin);
    }

    static as (val) {
        if (val && val.constructor===UUID) {
            return val;
        } else if (!val) {
            return UUID.ZERO; //?
        } else {
            return UUID.fromString(val.toString());
        }
    }

    static is (val) {
        if (!val) return false;
        if (val.constructor===UUID) return true;
        UUID.RE_UID.lastIndex = 0;
        return UUID.RE_UID.test(val.toString());
    }

    get ms () {
        return this.Value.ms;
    }

    toRFC4122() {
        const date = this.Value.toDate();
        const pid = [0,0,0,0,0,0]; // 8*6=48 bit
        if (this._origin.length>8)
            return null;
        const orig = new Base64x64(this._origin);
        let i = orig.lowInt;
        pid[5] = i&255;
        i>>=8;
        pid[4] = i&255;
        i>>=8;
        pid[3] = i&255;
        i>>=8;
        i |= orig.highInt << 6;
        pid[2] = i&255;
        i>>=8;
        pid[1] = i&255;
        i>>=8;
        pid[0] = i&255;
        return uuid.v1({
            node: pid,
            clockseq: 0,
            msecs: date.getTime()
        });
    }

    toZipString (default_uuid) {
        const uuid = UUID.as(default_uuid);
        if (this.origin===uuid.origin) {
            if (this.time===uuid.time)
                return '';
            return Base64x64.toZipString(this.time, uuid.time);
        } else {
            const t = Base64x64.toZipString(this.time, uuid.time);
            const o = Base64x64.toZipString(this.origin, uuid.origin);
            const s = (!t || Base64x64.RS_PREFIX_SEP.indexOf(o[0])===-1) ? '-' : '';
            return t+s+o;
        }
    }

}

UUID.SEPARATORS = "-+%*";
UUID.TIMESTAMP_SEPARATOR = "-";
// TODO waterfall derivation
UUID.RS_SEPS = "[-+%*]";
UUID.RS_UID = ('(=)(?:'+UUID.RS_SEPS+'(=))?').replace(/=/g, Base64x64.RS_INT);
UUID.RE_UID = new RegExp('^'+UUID.RS_UID+'$');
UUID.RE_UID_G = new RegExp(UUID.RS_UID, 'g');
UUID.RS_ZIP_UUID = '(' + Base64x64.RS_ZIP_INT + ')?(?:('+UUID.RS_SEPS+')?(' +
    Base64x64.RS_ZIP_INT + '))?';
UUID.RE_ZIP_UUID = new RegExp('^'+UUID.RS_ZIP_UUID+'$');

UUID.zero = Base64x64.zero;
UUID.ZERO = new UUID(UUID.zero);
UUID.never = '~';
UUID.NEVER = new UUID(UUID.never);
UUID.ERROR = new UUID(Base64x64.INCORRECT, '0');

module.exports = UUID;
