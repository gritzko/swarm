/**
 * Created by gritzko on 5/25/17.
 */
"use strict";
const Base =require("./Base64x64");
const Op = require("./Op");

class Frame {

    constructor (body, mode) {
        this._body = body || '';
        this._last = ['0','0','0','0','0','0','0','0'];
        mode = mode || (Frame.ZIP_OPTIONS.VARLEN|Frame.ZIP_OPTIONS.SKIPTOK|Frame.ZIP_OPTIONS.PREFIX);
        this._options = {
            varlen: 0!==(mode & Frame.ZIP_OPTIONS.VARLEN),
            skipquant: 0!==(mode & Frame.ZIP_OPTIONS.SKIPQUANT),
            prefix: 0!==(mode & Frame.ZIP_OPTIONS.PREFIX),
            skiptok: (0!==(mode & Frame.ZIP_OPTIONS.SKIPTOK)), // || (o_prefix&&o_skipquant),
            spaceops: 0!==(mode & Frame.ZIP_OPTIONS.SPACEOPS),
            redefault: 0!==(mode & Frame.ZIP_OPTIONS.REDEFAULT)
        };
    }

    push_raw (ints, string_values) {

        if (!string_values || string_values.constructor!==Array || !string_values.length)
            throw new Error("invalid values");
        if (!ints || ints.constructor!==Array || ints.length!==8)
            throw new Error("invalid ints");

        let buf = '';
        const opts = this._options;

        if (opts.spaceops && this._body.length) {
            buf += ' ';
        }

        // nothing 0  quant 1  redef 2  prefix 3  tail 4  done 5
        let prev_at = 0;

        for(let int_at=0; int_at<8; int_at++) {

            const uid_at = int_at >> 1;
            const cur_int = ints[int_at];
            let last_int = this._last[int_at];
            const is_origin = int_at&1;
            let at = 0;

            if (opts.skiptok && cur_int===last_int) {
                prev_at = 0;
                continue;
            }

            const quant = is_origin ? '-' : Op.UID_SEPS[uid_at];

            if ( !opts.skipquant ) {
                if (is_origin && prev_at===0)
                    buf += Op.UID_SEPS[uid_at];
                buf += quant;
                at = 1;
            }

            let prefix = Base.prefix_length(last_int, cur_int);

            if (opts.redefault && uid_at>0 && prefix<7) {
                let redef = '|';
                for(let re=1; re<4; re++) {
                    if (re===uid_at) continue;
                    const re_int = (re<uid_at ? ints : this._last)[(re<<1)|is_origin];
                    const re_prefix = Base.prefix_length(cur_int, re_int);
                    if (re_prefix>prefix+2) {
                        const signs = "/\\|/\\";
                        const off = 2 - uid_at + re;
                        redef = signs[off];
                        prefix = re_prefix;
                        last_int = re_int;
                    }
                }
                if (redef!=='|' && (prefix===10 || opts.prefix)) {
                    if (at===0 && prev_at<2)
                        buf += quant;
                    buf += redef;
                    at = 2;
                }
            }

            if (opts.skiptok && prefix===10) {
                prev_at = at;
                continue;
            }

            if (!opts.prefix || prefix<4) {

                if (at===0 && prev_at!==5)
                    buf += quant;

                buf += cur_int;
                at = opts.varlen ? 4 : 5;

            } else if (prefix<10) {

                if (at===0 && prev_at<3)
                    buf += quant;
                buf += Op.PREFIX_SEPS[prefix-4];
                buf += cur_int.substr(prefix); // FIXME !varlen
                at = opts.varlen ? 4 : 5;

            }

            prev_at = at;

        }

        this._body += buf;
        this._body += string_values.join('');

        this._last = ints;
    }

    push (op) {
        this.push_raw(op.ints(), op.raw_values());
    }

    [Symbol.iterator]() {
        return new Frame.Iterator (this._body);
    }

    static fromString (body) {
        return new Frame(body);
    }

    toString () {
        return this._body;
    }

}

Frame.RE_WSP = /[\s\t]*/g;
Frame.re_terminators = /\n*/g;

Frame.ZIP_OPTIONS = {
    VARLEN: 1,
    SKIPQUANT: 2,
    PREFIX: 4,
    SKIPTOK: 8,
    SPACEOPS: 32,
    REDEFAULT: 16,
    ALLSET: 31
};

class Iterator {

    constructor (body) {
        this._body = body;
        this._last = null;
        this._offset = 0;
        this._index = -1;
    }

    skip (re) {

    }

    /** greedy regex allowing for a zero match */
    eat (re) {
        re.lastIndex = this._offset;
        const m = re.exec(this._body);
        if (!m || !m[0] || m.index!==this._offset)
            return null;
        this._offset += m[0].length;
        return m;
    }

    _terminate (error) {
        this._ints[5] = "~~~~~~~~~~";
        this._ints[6] = "0";
        this._values = [error];
        this._offset = -1;
        return {done: true, value: null};
    }

    next () {

        this.eat(Frame.RE_WSP);

        if ( this._offset===this._body.length )
            return { done: true, value: null };

        const m = this.eat(Op.RE_OP_G);

        if ( !m )
            return { done: true, value: Op.error("syntax violation") };

        this._last = Op.fromString(m, this._last ? this._last.ints() : undefined);
        this._index++;
        // FIXME sanity checks

        return {
            done: this._last.isError(),
            value: this._last
        };
    }

}
Frame.Iterator = Frame.Iterator = Iterator;


module.exports = Frame;