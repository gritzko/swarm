"use strict";

var base64 =
   '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';
var codes =
    [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
    -1,-1,-1,-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,-1,-1,-1,-1,-1,-1,-1, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    28, 29, 30, 31, 32, 33, 34, 35,-1,-1,-1,-1, 36,-1, 37, 38, 39, 40,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57,
    58, 59, 60, 61, 62,-1,-1,-1, 63, -1];

var rs64 = '[0-9A-Za-z_~]';
var rs64x64 = rs64+'{1,10}'; // 60 bits is enough for everyone
var reTok =  new RegExp('^'+rs64x64+'$'); // plain no-extension token
var re64l =  new RegExp('[0-9A-Za-z_~]', 'g');

function is (base) {
    return base && base.constructor===String &&
            base.length<=10 && reTok.test(base);
}

function date2pair (date) {
    var high = (date.getUTCFullYear()-2010)*12 + date.getUTCMonth();
    high <<= 6;
    high |= date.getUTCDate();
    high <<= 6;
    high |= date.getUTCHours();
    high <<= 6;
    var low = date.getUTCMinutes();
    low <<= 6;
    low |= date.getUTCSeconds();
    low <<= 12;
    low |= date.getUTCMilliseconds();
    low <<= 12;
    return {high:high, low:low};
}

function date2base (date) {
    return pair2base(date2pair(date));
}

function msseq2base (ms, seq) {
    var pair = date2pair(new Date(ms));
    pair.low |= seq;
    return pair2base(pair);
}

function base2int (base) {
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

function int2base (i, pad) {
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

function base2pair (base) {
    return {
        high: base2int(base.substr(0, 5)),
        low: base.length<=5 ? 0 : base2int(base.substr(5,5))
    };
}

function pair2base (pair) {
    var ret = int2base(pair.high, pair.low!==0);
    if (pair.low===0) {
        if (ret==='') { ret = '0'; }
    } else {
        ret += int2base(pair.low, false);
    }
    return ret;
}

function base2date (base) {
    var pair = base2pair(base), high = pair.high, low = pair.low;
    //var seq = low&4095;
    low >>= 12;
    var msec = low&4095;
    low >>= 12;
    var second = low&63;
    var minute = high&63;
    high >>= 6;
    var hour = high&63;
    high >>= 6;
    var day = high&63;
    high >>= 6;
    var months = high&4095;
    var month = months % 12;
    var year = 2010 + (((months - month) / 12) | 0);
    var ms = Date.UTC(year, month, day, hour, minute, second, msec);
    return new Date(ms);
}


module.exports = {
    is : is,
    fromDate : date2base,
    toPair : base2pair,
    fromPair : pair2base,
    toDate : base2date,
    fromMsSeq : msseq2base,
    INFINITY: "~"
};
