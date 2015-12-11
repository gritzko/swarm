/**
 * A Lamport timestamp is a pair of a time value and a process id (source).
 * The order is lexicographic both for time values and timestamps.
 * Constructor examples: new LT("0time","author"), new LT("0time+author").
 * new LT("author") is understood as "0+author"; empty source is not valid,
 * unless the time value is 0 (new LT() is "0").
 *
 * @flow
 */
'use strict';

import base64 from './base64';

var reTok = new RegExp('^'+base64.rT+'$'); // plain no-extension token
var rsTokExt = '(=)(?:\\+(=))?'.replace(/=/g, base64.rT);
var reTokExt = new RegExp('^'+rsTokExt+'$');
var reTokExtMG = new RegExp(rsTokExt, 'mg');

class LamportTimestamp {

    _time: string;
    _source: string;

    constructor(time: ?string, source: ?string = null) {
        if (!source) {
            if (!time) {
                time = '0';
                source = '';
            } else {
                var m = LamportTimestamp.reTokExt.exec(time);
                if (!m) {
                    throw new Error('malformed Lamport timestamp');
                }
                time = m[1];
                source = m[2] || '';
            }
        }
        if (!source && time!=='0') {
            source = time;
            time = '0';
        }
        this._time = time || '0';
        this._source = source || '';
    }

    toString(): string {
        return this._time + (this._source ? '+' + this._source : '');
    }

    isZero(): boolean {
        return this._time === '0';
    }

    // Is greater than the other stamp, according to the the lexicographic order
    gt(stamp: string | LamportTimestamp): boolean {
        if (!(stamp instanceof LamportTimestamp)) {
            stamp = new LamportTimestamp(stamp);
        }
        return this._time > stamp._time ||
            (this._time===stamp._time && this._source>stamp._source);
    }

    eq(stamp: string | LamportTimestamp): boolean {
        if (!(stamp instanceof LamportTimestamp)) {
            stamp = new LamportTimestamp(stamp);
        }
        return this._time===stamp._time && this._source===stamp._source;
    }

    time(): string {
      return this._time;
    }

    source(): string {
      return this._source;
    }

    author(): string {
        var i = this._source.indexOf('~');
        return i===-1 ? this._source : this._source.substr(0,i);
    }

    // $FlowFixMe: when Flow adds support for static prop initializers
    static reTok = reTok;

    // $FlowFixMe: when Flow adds support for static prop initializers
    static reTokExt = reTokExt;

    // $FlowFixMe: when Flow adds support for static prop initializers
    static reTokExtMG = reTokExtMG;

    static parse(str): Array<LamportTimestamp> {
        var ret = [], m;
        if (!str) { return ret; }
        LamportTimestamp.reTokExtMG.lastIndex = 0;
        while (m = LamportTimestamp.reTokExtMG.exec(str)) {
            ret.push(new LamportTimestamp(m[1], m[2]));
        }
        return ret;
    }

    static is(str): boolean {
        LamportTimestamp.reTokExt.lastIndex = 0;
        return LamportTimestamp.reTokExt.test(str);
    }
}


module.exports = LamportTimestamp;
