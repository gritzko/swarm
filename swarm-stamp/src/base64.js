"use strict";

var base64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_'+
             'abcdefghijklmnopqrstuvwxyz~';
var codes  = new Array(128);
var rT =     '[0-9A-Za-z_~]{1,80}'; // 60*8 bits is enough for everyone
var reTok =  new RegExp('^'+rT+'$'); // plain no-extension token
var re64l =  new RegExp('[0-9A-Za-z_~]', 'g');

for(var i=0; i<128; i++) { codes[i] = 100; }
for(i=0; i<base64.length; i++) { codes[base64.charCodeAt(i)] = i; }

function int2base (i, padlen) {
    if (i < 0 || i >= (1 << 30)) {
        throw new Error('out of range: '+i);
    }
    var ret = '', togo = padlen || 5;
    for (; i || (togo > 0); i >>= 6, togo--) {
        ret = base64.charAt(i & 63) + ret;
    }
    return ret;
}

function base2int (base) {
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
