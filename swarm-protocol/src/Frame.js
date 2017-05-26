/**
 * Created by gritzko on 5/25/17.
 */
"use strict";
import Base from "./Base64x64";
import Op from "./Op";

export default class Frame {

    constructor (frame, mode) {
        this._body = frame ? frame.body : '';
        this._last = ['0','0','0','0','0','0','0','0'];
        this._options = {
            varlen: 0!==(mode & Frame.ZIP_OPTIONS.VARLEN),
            skipquant: 0!==(mode & Frame.ZIP_OPTIONS.SKIPQUANT),
            prefix: 0!==(mode & Frame.ZIP_OPTIONS.PREFIX),
            skiptok: (0!==(mode & Frame.ZIP_OPTIONS.SKIPTOK)), // || (o_prefix&&o_skipquant),
            spaceops: 0!==(mode & Frame.ZIP_OPTIONS.SPACEOPS),
            redefault: 0!==(mode & Frame.ZIP_OPTIONS.REDEFAULT)
        };
    }

    push (ints, values) {

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

            const quant = is_origin ? '-' : Frame.QUANTS[uid_at];

            if ( !opts.skipquant ) {
                if (is_origin && prev_at===0)
                    buf += Frame.QUANTS[uid_at];
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
                    if (re_prefix.length>prefix+2) {
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
                buf += Frame.PREFIX_BRACKETS[prefix-4];
                buf += cur_int.substr(prefix); // FIXME !varlen
                at = opts.varlen ? 4 : 5;

            }

            prev_at = at;

        }

        for(let v=0; v<values.length; v++) {
            const value = values[v];
            switch (value.constructor) {
                case String: break;
                case Number: break;
                case Boolean:break;
                default:
            }
        }

        this._last = ints;
    }

    [Symbol.iterator]() {
        return new Frame.Iterator (this);
    }

    static fromString (body) {

    }

    toString () {
        return this._body;
    }

}

Frame.re_uid = /([.#@:\-])?(\\\/)?(\(\[{}]\))?([0-9A-Za-z_~]{0,10})/;
Frame.re_value = /=\d{1,19}|"(?:[^"]|\\")"|>|/;
Frame.re_whitespace = /[\s\t]*/;
Frame.re_terminators = /\n*/;

Frame.HALF_QUANTS = "-";
Frame.QUANTS = ".#@:";
Frame.VALUE_SEPS = "=^\">";
Frame.INT_SEP = '=';
Frame.REF_SEP = '>';
Frame.STRING_SEP = '"';
Frame.FLOAT_SEP = '^';
Frame.REDEFS = "\\|/";
Frame.PREFIX_BRACKETS = "([{}])";

Frame.ZIP_OPTIONS = {
    VARLEN: 1,
    SKIPQUANT: 2,
    PREFIX: 4,
    SKIPTOK: 8,
    SPACEOPS: 32,
    REDEFAULT: 16
};

class Iterator {

    constructor (body) {
        this._body = body;
        this._ints = ['0','0','0','0','0','0','0','0'];
        this._values = [];
        this._offset = 0;
        this._index = -1;
    }

    skip (re) {

    }

    /** greedy regex allowing for a zero match */
    eat (re) {
        Frame.re_uid.lastIndex = this._offset;
        const m = re.exec(this._body);
        if (!m || !m[0] || m.index!==this._offset)
            return null;
        this._offset += m[0].length;
    }

    _terminate (error) {
        this._ints[5] = "~~~~~~~~~~";
        this._ints[6] = "0";
        this._values = [error];
        this._offset = ;
        return {done: true, value: null};
    }

    next () {


        this.eat(Frame.re_terminators);
        if (this._offset===this._body.length)
            return this._terminate();


        // FIXME sanity checks
        this._index++;

    }

}
Frame.Iterator = Frame.Iterator = Iterator;
