"use strict";

var base64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_'+
             'abcdefghijklmnopqrstuvwxyz~';
var rT =     '[0-9A-Za-z_~]{1,80}'; // 60*8 bits is enough for everyone
var reTok =  new RegExp('^'+rT+'$'); // plain no-extension token
var re64l =  new RegExp('[0-9A-Za-z_~]', 'g');

function int2base (i, padlen) {
    if (i < 0 || i >= (1 << 30)) {
        throw new Error('out of range');
    }
    var ret = '', togo = padlen || 5;
    for (; i || (togo > 0); i >>= 6, togo--) {
        ret = base64.charAt(i & 63) + ret;
    }
    return ret;
}

function base2int (base_str) {
    var ret = 0, l = base_str.match(re64l);
    for (var shift = 0; l.length; shift += 6) {
        ret += base64.indexOf(l.pop()) << shift; // TODO performance
    }
    return ret;
}

module.exports = {
    int2base: int2base,
    base2int: base2int,
    base64: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_'+
            'abcdefghijklmnopqrstuvwxyz~',
    rT:     rT,
    reTok:  reTok,
    re64l:  re64l
};
