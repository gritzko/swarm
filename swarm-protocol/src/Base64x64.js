"use strict";

const base64 =
   '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';
const codes =
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,-1,-1,-1,-1,-1,-1,-1, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    28, 29, 30, 31, 32, 33, 34, 35,-1,-1,-1,-1, 36,-1, 37, 38, 39, 40,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57,
    58, 59, 60, 61, 62,-1,-1,-1, 63, -1];

const rs64 = '[0-9A-Za-z_~]';
const rs64x64 = rs64+'{1,10}'; // 60 bits is enough for everyone
const reTok =  new RegExp('^'+rs64x64+'$'); // plain no-extension token
const reNorm64x64 = /^([0-9A-Za-z_~]+?)0*$/;

/**
 * Base64x64 timestamps are 64-bit timestamps in Base64.
 * Base64x64 stamps has consistent alphanumeric order, so they can be
 * compared as strings. Base64x64 employs its own variety of base64,
 * because common [base64 variants][base64] lack that feature.
 * Swarm base64 symbols are:
 * `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~`
 * Also, Base64x64 stamps have their *right* zeroes trimmed
 * (i.e. `1` means `1000000000`, not `0000000001`) to stay consistent
 * with the alphanumeric order.
 * See the [specification][spec] for the details.
 *
 * [base64]: https://en.wikipedia.org/wiki/Base64#Variants_summary_table
 * [spec]: https://www.gitbook.com/book/gritzko/swarm-the-protocol/welcome
*/
class Base64x64 {

    constructor (value, seq) {
        this._high = -1;
        this._low = -1;
        this._base = '0';
        this._date = null;
        if (!value) value = '0';
        switch (value.constructor) {
            case String:
                this._base = Base64x64.normalize(value);
                break;
            case Date:
                this._date = value;
                this._date2pair();
                if (seq) {
                    seq = seq|0;
                    if (seq<0 || seq>=(1<<12)) {
                        throw new Error("invalid sequence number");
                    }
                    this._low |= seq;
                }
                this._pair2base();
                break;
            case Array:
                if (value.length!==2) {
                    throw new Error("need a 2-element int array");
                }
                this._high = value[0];
                this._low = value[1];
                this._pair2base();
                break;
            case Base64x64:
                this._base = value._base;
                break;
            default:
                this._base = Base64x64.normalize(value.toString());
        }
    }

    static normalize (base) {
        reNorm64x64.lastIndex = 0;
        let m = reNorm64x64.exec(base.toString());
        if (m===null) {
            throw new Error("not a Base64x64 string: "+base);
        }
        return m[1];
    }

    static toString (base) {
        return new Base64x64(base).toString();
    }

    static is (base) {
        return base && (base.constructor===Base64x64 || reTok.test(base.toString()) );
    }

    static now (offset_ms) {
        var date = new Date();
        if (offset_ms!==undefined && offset_ms!==0) {
            date = new Date(date.getTime()+offset_ms);
        }
        return new Base64x64(date);
    }

    toString () {
        return this._base;
    }

    get length () {
        return this._base.length;
    }

    isZero () {
        return this._base==='0';
    }

    toArray () {
        if (this._high===-1) {
            this._base2pair();
        }
        return [this._high, this._low];
    }

    toDate () {
        if (this._date===null) {
            if (this._high===-1) {
                this._base2pair();
            }
            this._pair2date();
        }
        return this._date;
    }

    get seq () {
        if (this._high===-1) {
            this._base2pair();
        }
        return this._low & ((1<<12)-1);
    }

    _date2pair () {
        var d = this._date;
        var high = (d.getUTCFullYear()-2010)*12 + d.getUTCMonth();
        high <<= 6;
        high |= d.getUTCDate()-1;
        high <<= 6;
        high |= d.getUTCHours();
        high <<= 6;
        high |= d.getUTCMinutes();
        var low = d.getUTCSeconds();
        low <<= 12;
        low |= d.getUTCMilliseconds();
        low <<= 12;
        this._high = high;
        this._low = low;
    }

    _base2pair () {
        this._high = Base64x64.base64x32toInt(this._base.substr(0, 5));
        this._low = this._base.length<=5 ?
            0 : Base64x64.base64x32toInt(this._base.substr(5,5));
    }

    _pair2base () {
        var ret = Base64x64.intToBase64x32(this._high, this._low!==0);
        if (this._low===0) {
            if (ret==='') { ret = '0'; }
        } else {
            ret += Base64x64.intToBase64x32(this._low, false);
        }
        this._base = ret;
    }

    /** convert int to a Base64x32 number (right zeroes skipped) */
    static intToBase64x32 (i, pad) {
        if (i < 0 || i >= (1 << 30)) {
            throw new Error('out of range: '+i);
        }
        var ret = '', pos = 0;
        while (!pad && (i&63)===0 && pos++<5) {
            i>>=6;
        }
        while (pos++<5) {
            ret = base64.charAt(i & 63) + ret;
            i>>=6;
        }
        return ret;
    }

    static base64x32toInt (base) {
        if (base.length>5) {
            throw new Error("more than 30 bits");
        }
        var ret = 0, i = 0;
        while (i<base.length) {
            ret <<= 6;
            var code = base.charCodeAt(i);
            if (code>=128) { throw new Error('invalid char'); }
            var de = codes[code];
            if (de===-1) { throw new Error('non-base64 char'); }
            ret |= de;
            i++;
        }
        while (i++<5) {
            ret <<= 6;
        }
        return ret;
    }

    _pair2date () {
        let low = this._low, high = this._high;
        low >>= 12;
        let msec = low&4095;
        low >>= 12;
        let second = low&63;
        let minute = high&63;
        high >>= 6;
        let hour = high&63;
        high >>= 6;
        let day = (high&63) + 1;
        high >>= 6;
        let months = high&4095;
        let month = months % 12;
        let year = 2010 + (((months - month) / 12) | 0);
        let ms = Date.UTC(year, month, day, hour, minute, second, msec);
        this._date = new Date(ms);
    }

    isAbnormal () {
        return this._base >= Base64x64.INFINITY;
    }

    static isAbnormal (base) {
        return base.charAt(0)==='~';
    }

    get ms () {
        return this.toDate().getTime();
    }

    equals (b) {
        if (!b) {
            return false;
        } else if (b.constructor===Base64x64) {
            return this._base === b._base;
        } else {
            return this.equals(new Base64x64(b));
        }
    }

    eq (b) { return this.equals(b); }

    inc () {
        if (this._high===-1) {
            this._base2pair();
        }
        if (this.isAbnormal()) {
            return new Base64x64(Base64x64.INCORRECT);
        }
        if ( this._low < Base64x64.MAX32 ) {
            return new Base64x64([this._high, this._low+1]);
        } else {
            return new Base64x64([this._high+1, 0]);
        }
    }

    static inc (str) {
        return new Base64x64(str).inc().toString();
    }

    /** @param {Number} pos - positions (not bits) */
    rightShift (pos) {
        let base = this._base;
        for(let i=0; i<pos; i++)
            base = '0' + base;
        base = base.substr(0,10);
        return new Base64x64(base);
    }

    /** @param {String|Base64x64} str
     *  @param {Number} pos */
    static rightShift (str, pos) {
        return new Base64x64(str).rightShift(pos).toString();
    }

    leftShift (pos) {
        return new Base64x64(this._base.substr(pos) || '0');
    }

    static leftShift (str, pos) {
        return new Base64x64(str).leftShift(pos).toString();
    }

    next (length) {
        if (!length || length>10)
            throw new Error('invalid base64 number length');
        let at = length-1;
        let base = this._base;
        while (base.length<length)
            base = base + '0';
        while (at>=0 && base[at]==='~')
            at--;
        if (at<0)
            return Base64x64.INCORRECT;
        let i = codes[base.charCodeAt(at)];
        let p = base64[i+1];
        return new Base64x64(base.substr(0,at) + p);
    }

    round (till) {
        return new Base64x64(this._base.substr(0, till) || '0');
    }

    static round (base, pos) {
        return new Base64x64(base).round(pos).toString();
    }

    /** @returns {String} - not a valid Base64x64 number */
    static commonPrefix (one, two) {
        let common = '';
        return common || '';
    }

    static prefix (a, b) {
        const len = Base64x64.prefix_length(a,b);
        return len ? Base64x64.toString(a.substr(0, len)) : Base64x64.ZERO;
    }

    static prefix_length (a, b) {
        const v1 = Base64x64.toString(a), v2 = Base64x64.toString(b);
        let i=0;
        while (i<v1.length && i<v2.length && v1[i]===v2[i]) i++;
        if (i===v1.length && i===v2.length)
            return 10;
        return i;
    }

    get highInt () {
        if (this._high===-1) {
            this._base2pair();
        }
        return this._high;
    }

    get lowInt () {
        if (this._high===-1) {
            this._base2pair();
        }
        return this._low;
    }

    /** Shorten the number by removing trailing chars, while still
     *  preserving order relative to repere. (Variable precision trick.) */
    relax (repere, min_length) {
        min_length = min_length || 1;
        const reper = new Base64x64(repere).toFullString();
        const mine = this.toFullString();
        let p = 0;
        while (p<10 && mine[p] === reper[p])
            p++;
        p++;
        if (p<min_length)
            p = min_length;
        return new Base64x64(mine.substr(0, p));
    }

    toFullString () {
        return this._base + Base64x64.FULL_ZERO.substr(this._base.length);
    }

    slice (offset, length) {
        return new Base64x64(Base64x64.FULL_ZERO.substr(0, offset)+this._base.substr(offset, length));
    }

    static isZero (b) {
        return Base64x64.as(b).isZero();
    }

    static as (b) {
        if (!b) return Base64x64.ZERO;
        if (b.constructor===Base64x64) return b;
        return new Base64x64(b.toString());
    }


}

Base64x64.INFINITY = "~";
Base64x64.INCORRECT = "~~~~~~~~~~";
Base64x64.MAX32 = (1<<30)-1;
Base64x64.zero = "0";
Base64x64.ZERO = new Base64x64(Base64x64.zero);
Base64x64.rs64x64 = rs64x64;
Base64x64.rs64 = rs64;
Base64x64.FULL_ZERO = '0000000000';

// convert int to a classic base64 number (left zeroes skipped)
Base64x64.int2base = function (i, padlen) {
    if (i < 0 || i >= (1 << 30)) {
        throw new Error('out of range: '+i);
    }
    var ret = '', togo = padlen || 5;
    for (; i || (togo > 0); i >>= 6, togo--) {
        ret = base64.charAt(i & 63) + ret;
    }
    return ret;
};

Base64x64.base2int = function (base) {
    var ret = 0;
    for(var i=0; i<base.length; i++) {
        ret <<= 6;
        var code = base.charCodeAt(i);
        if (code>=128) { throw new Error('invalid char'); }
        var de = codes[code];
        if (de===100) { throw new Error('non-base64 char'); }
        ret |= de;
    }
    return ret;
};

module.exports = Base64x64;
