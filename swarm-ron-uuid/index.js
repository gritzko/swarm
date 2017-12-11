"use strict";
const RON = require('swarm-ron-grammar');

class UUID {

    /** trusted constructor */
    constructor (time, origin, sep) {
        /** @type {String} */
        this.value = time;
        /** @type {String} */
        this.origin = origin;
        /** @type {String} */
        this.sep = sep || '-';
    }

    get type () {
        return this.sep; // TODO swap, phase out
    }

    /*
    static read_uuid (ints, at, value, sign, origin) {

    }

    /** @returns {String} *
    static write_uuid (ints, at, context, ctxat) {

    }
    */

    /**
     *
     * @param context_uuid {UUID}
     * @returns {String}
     */
    toString (context_uuid) {
        const ctx = context_uuid || UUID.ZERO;
        if (this.origin==='0') { // nice shortcuts
            if (this.value in UUID.TIME_CONST) {
                if (this.sep==='-') return this.value;
            } else {
                if (this.sep==='$') return this.value;
            }
        }
        if (this.origin===ctx.origin) {
            if (this.value===ctx.value) return '';
            let zip = UUID.zip64(this.value, ctx.value);
            const exp_sep = zip===this.value ? '$' : '-';
            return exp_sep===this.sep ? zip : zip+this.sep;
        } else {
            const time = UUID.zip64(this.value, ctx.value);
            const orig = UUID.zip64(this.origin, ctx.origin);
            if (this.sep!=='-' || orig===this.origin)
                return time + this.sep + orig;
            else
                return time + orig;
        }
    }

    /** @param uuid {UUID} */
    le (uuid) {
        if (uuid.value===this.value)
            return uuid.origin > this.origin;
        return uuid.value > this.value;
    }

    /** @param uuid {UUID} */
    ge (uuid) {
        if (uuid.value===this.value)
            return uuid.origin < this.origin;
        return uuid.value < this.value;
    }

    /** @param uuid {UUID} */
    gt (uuid) {
        return !this.le(uuid);
    }

    /** @param uuid {UUID} */
    lt (uuid) {
        return !this.ge(uuid);
    }

    /** @param uuid {UUID} */
    eq (uuid) {
        return this.value === uuid.value &&
            this.origin === uuid.origin &&
            this.sep === uuid.sep;
    }

    isZero () {
        return this.value==='0';
    }

    /**
     *
     * @param string {String} - serialized UUID
     * @param context_uuid {UUID=} - default UUID
     * @param offset {Number=}
     * @returns {UUID}
     */
    static fromString (string, context_uuid, offset) {
        const ctx = context_uuid || UUID.ZERO;
        if (!string) return ctx;
        const off = offset===undefined?0:offset;
        UUID.RE.lastIndex = off;
        const m = UUID.RE.exec(string);
        if (!m || m.index!==off)
            return UUID.ERROR;
        if (offset===undefined && m[0]!==string)
            return UUID.ERROR;
        const time = UUID.unzip64(m[1], ctx.value);
        if (!m[2] && !m[3] && m[1]===time && !(time in UUID.TIME_CONST)) {
            return new UUID(time, '0', '$'); // nice shortcut
        } else if (!m[1] && !m[2] && !m[3]) {
            return ctx;
        } else {
            const orig = UUID.unzip64(m[3], ctx.origin);
            return new UUID(time, orig, m[2]||'-');
        }
    }
/* TODO swarm-clock-gregorian
    static fromRFC4122 (uid) {

    }

    static fromMAC (mac) {

    }

    static fromDate (date, uuid) {

    }
*/
    /**
     * A normalizing function.
     * @param smth {*}
     * @returns {UUID}
     */
    static as (smth) {
        if (!smth) return UUID.ERROR;
        if (smth.constructor===UUID) return smth;
        return UUID.fromString(smth.toString());
    }

    static unzip64 (zip, ctx) {
        if (!zip) return ctx;
        let ret = zip;
        const prefix = UUID.PREFIXES.indexOf(ret[0]);
        if (prefix!==-1) {
            let pre = ctx.substr(0, prefix+4);
            while (pre.length<prefix+4) pre += '0';
            ret = pre + ret.substr(1);
        }
        while (ret.length>1 && ret[ret.length-1]==='0')
            ret = ret.substr(0, ret.length-1);
        return ret;
    }

    static zip64 (int, ctx) {
        if (int===ctx) return '';
        let p = 0;
        while (int[p]===ctx[p]) p++;
        if (p===ctx.length)
            while (int[p]==='0') p++;
        if (p<4) return int;
        return UUID.PREFIXES[p-4] + int.substr(p);
    }

    isTime () {
        return this.sep === '-' || this.sep === '+';
    }

    isEvent () {
        return this.sep === '-';
    }

    isDerived () {
        return this.sep === '+';
    }

    isHash () {
        return this.sep === '%';
    }

    isName () {
        return this.sep === '$';
    }

}

UUID.ZERO = new UUID("0", "0");
UUID.NEVER = new UUID("~", "0");
UUID.ERROR = new UUID("~~~~~~~~~~", "0");
UUID.RE = new RegExp(RON.UUID.source, 'g');
UUID.PREFIXES = "([{}])";
UUID.TIME_CONST = {'0':1, '~':1, '~~~~~~~~~~':1};

const B64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';
UUID.BASE64 = B64;
const codes = new Int8Array(128);
codes.fill(-1);
for(let i=0; i<B64.length; i++)
    codes[B64.charCodeAt(i)] = i;
UUID.CODES = codes;

class Vector {
    /**
     *
     * @param uuids {String}
     * @param default_uuid {UUID?}
     */
    constructor (uuids, default_uuid) {
        this.body = uuids ? uuids.toString() : '';
        /** @type {UUID} */
        this.default_uuid = default_uuid || UUID.ZERO;
        this.last = this.default_uuid;
    }

    [Symbol.iterator]() {
        return new Iterator (this.body, this.default_uuid);
    }

    /**
     * @param new_uuid {UUID}
     */
    push (new_uuid) {
        const uuid = UUID.as(new_uuid);
        const str = uuid.toString(this.last);
        // if (this.body && this.body[this.body.length-1]!==',' &&
        //     (!str||UUID.CODES[str.charCodeAt(0)]!==-1))
        // TODO optimize
        //     this.body += ',';
        if (this.body)
            this.body += ',';
        this.body += str;
        this.last = uuid;
    }

    toString () {
        return this.body;
    }

    static is () {

    }
}

class Iterator {
    /**
     *
     * @param body {String}
     * @param default_uuid {UUID=}
     */
    constructor (body, default_uuid) {
        /** type {String} */
        this.body = body ? body.toString() : '';
        this.offset = 0;
        /** @type {UUID} */
        this.uuid = default_uuid || UUID.ZERO;
        this.nextUUID();
    }

    toString () {
        return this.body.substr(this.offset);
    }

    nextUUID () {
        if (this.offset===this.body.length) {
            this.uuid = null;
        } else {
            this.uuid = UUID.fromString(this.body, this.uuid, this.offset);
            if (UUID.RE.lastIndex===0 && this.offset!==0)
                this.offset = this.body.length;
            else
                this.offset = UUID.RE.lastIndex;
            if(this.body[this.offset]===',') this.offset++;
        }
    }

    next () {
        const ret = this.uuid;
        if (ret) this.nextUUID();
        return {
            value: ret,
            done: ret===null
        }
    }
}

UUID.Vector = Vector;
UUID.Vector.Iterator = Iterator;
UUID.Iterator = Iterator;
module.exports = UUID;
