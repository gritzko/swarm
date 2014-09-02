"use strict";

var env = require('./env');
var Spec = require('./Spec');

/** LongSpec is a Long Specifier, i.e. a string of ids
 *  that may be indeed very (many megabytes) long.
 *  Ids are compressed using dynamic dictionaries
 *  (codebooks) or "unicode numbers" (base-32768
 *  encoding utilizing Unicode symbols as quasi-binary).
 *  Unicode numbers are particularly handy for encoding
 *  timestamps.
 *  May assign a shared codebook (2nd parameter) using
 *  an object like {en:{'/Type':'/T'}, de:{'/T':'/Type'}} 
 *  or simply an empty object (initialized automatically).
 *  */
var LongSpec = function (spec, codeBook) {
    var cb = this.codeBook = codeBook || {en:{},de:{}};
    if (!cb.en) { cb.en = {}; }
    if (!cb.de) { // revert en to make de
        cb.de = {};
        for(var tok in cb.en)
            cb.de[cb.en[tok]] = tok;
    }
    if (!cb.lastCodes) 
        cb.lastCodes = 
            {'/':0x30,'#':0x30,'!':0x30,'.':0x30,'+':0x30};
    this.value = this.encode(spec); // TODO chunks
}

LongSpec.reQTokEn = /([/#\!\.\+])([0-\u802f]+)/g;
LongSpec.reQTok = new RegExp('([/#\\.!\\*\\+])(=)'.replace(/=/g, Spec.rT), 'g');
LongSpec.rTEn = '[0-\\u802f]+';
LongSpec.reQTokExtEn = new RegExp('([/#\\.!\\*])((=)(?:\\+(=))?)'.replace(/=/g, LongSpec.rTEn), 'g');

LongSpec.prototype.toString = function () {
    return this.decode(this.value).toString();
};

/* The method converts a (relatively) verbose Base64
 * specifier into an internal compressed format.
 * Compressed tokens are also variable-length; the
 * length of the token depends on the encoding
 * method used.
 * 1 unicode symbol: dictionary-encoded (up to 2^15 entries
 *    for each quant),
 * 2 symbols: simple timestamp base-2^15 encoded,
 * 3 symbols: timestamp+seq base-2^15,
 * 4 symbols and more: unencoded original (fallback).
 * */
LongSpec.prototype.encode = function encode (spec) {
    if (!spec) return '';
    var toks = spec.match(LongSpec.reQTok);
    if (!toks) { 
        throw new Error('invalid spec'); 
    }
    var ret = [];
    for(var i=0, tok=toks[i]; toks.length>i; tok=toks[++i]) {
        var quant=tok.charAt(0), body=tok.substr(1), en=body;
        if ( body.length<=3 || (quant in LongSpec.quants2code) ||
                (tok in this.codeBook.en) ) {
            en = this.codeBook.en[tok] ||
                 this.allocateCode(tok);
        } else if (body.length<=5) { // 2-symbol
            en = quant + LongSpec.base2uni2(body);
        } else if (body.length<=7) { // 3-symbol
            en = quant + LongSpec.base2uni3(body);
        } else { // verbatim
            en = tok;
        }
        ret.push(en);
    }
    return ret.join('');
};
LongSpec.quants2code = {'/':1,'.':1,'+':1};

LongSpec.prototype.allocateCode = function (tok) {
    var quant = tok.charAt(0);
    var cb = this.codeBook, lc = cb.lastCodes;
    if (lc[quant]<'z'.charCodeAt(0)) { // pick a nice letter
        for(var i=1; i<tok.length; i++) {
            var x = tok.charAt(i), en = quant+x;
            if (en in cb.de) continue;
            cb.en[tok] = en;
            cb.de[en] = tok;
            return en;
        }
    }
    while (lc[quant]<0x802f) {
        var x = String.fromCharCode(lc[quant]++);
        var en = quant + x;
        if ( en in cb.en ) { continue; }
        cb.en[tok] = en;
        cb.de[en] = tok;
        return en;
    }
    if (tok.length<=3) {
        throw new Error("can't allocate new code");
    }
    return tok; // out of codes
};

/** Decode a compressed specifier back into base64. */
LongSpec.prototype.decode = function decode (specQ2) {
    var toks = specQ2.match(LongSpec.reQTokEn);
    var ret = [], de = '';
    if (!toks) { 
        throw new Error('not an en-spec: '+specQ2); 
    }
    for(var i=0, tok=toks[i]; toks.length>i; tok=toks[++i]) {
        var quant = tok.charAt(0), body = tok.substr(1);
        switch (tok.length) {
            case 2:  de = this.codeBook.de[tok]; break;
            case 3:  de = quant+LongSpec.uni2base(body); break;
            case 4:  de = quant+LongSpec.uni3base(body); break;
            default: de = tok; break;
        }
        ret.push(de);
    }
    return new Spec(ret.join(''));
};
// 2^30 = 1^9 (bln)
// 1yr = 31mln sec
// 2^30sec = 30yr
// Q ?  { '?xx': '.lalalala' }
// '.lalalala?xx'
// ! num
// # num
// / dic
// . dic
// #special dic (mark @)
// dics are multiple-use, two dics pay off

LongSpec.base2uni2 = function (base) {
    var i = Spec.base2int(base);
    return LongSpec.int2uni(i);
};

LongSpec.base2uni3 = function (base) {
    var suffix = base.substr(5), body = base.substr(0,5);
    return LongSpec.base2uni2(body) + LongSpec.base2uni2(suffix);
};

LongSpec.int2uni = function (i) {
    var ret = '';
    for(; i>0; i>>=15)
        ret = String.fromCharCode(0x30+(i&0x7fff)) + ret;
    return ret || '0';
};

LongSpec.uni2base = function (uni) {
    var i = LongSpec.uni2int(uni);
    return Spec.int2base(i,1);
};

LongSpec.uni3base = function (uni) {
    var ret = LongSpec.uni2base(uni.substr(0,2));
    ret+= LongSpec.uni2base(uni.charAt(2));
    return ret;
};

LongSpec.uni2int = function (uni) {
    var ret = 0;
    for(var i=uni.length-1, shift=0; i>=0; i--, shift+=15) {
        ret |= (uni.charCodeAt(i)-0x30) << shift;
    }
    return ret;
};

/** Insert a token at a given position. */
LongSpec.prototype.insert = function (tok, i) {
    // TODO consider insertBefore, not insert(After)
    var en = this.encode(tok);
    if (i===-1) {
        this.value = en + this.value;
    } else if (i===undefined) {
        this.value = this.value + en;
    } else {
        var q = this.value.charAt(i);
        if (Spec.quants.indexOf(q)===-1) {
            throw new Error('mid-token offset');
        }
        LongSpec.reQTokExtEn.lastIndex = i;
        var m = LongSpec.reQTokExtEn.exec(this.value);
        var splitAt = i+m[0].length;
        var head = this.value.substr(0,splitAt),
            tail = this.value.substr(splitAt);
        this.value = head + en + tail;
    }
};

LongSpec.prototype.add = function ls_add (spec) {
    this.value += this.encode(spec);
};
LongSpec.prototype.append = LongSpec.prototype.add;

/** The method finds the first occurence of a token,
 *  returns an iterator.
 *  While the internal format of an iterator is kind of opaque,
 *  and generally is not recommended to rely on, that is
 *  actually a regex math array. Note that it contains encoded
 *  tokens.
 *  The second parameter is the position to start scanning
 *  from, passed either as an iterator or an offset. */
LongSpec.prototype.find = function (tok, i) {
    i = i || -1;
    var en = this.encode(tok).toString(); // don't split on +
    while ( -1 != (i=this.value.indexOf(en,i+1)) ) {
        var nextAt = i + en.length;
        if (nextAt===this.value.length) return i;
        var maybeQuant = this.value.charAt(nextAt);
        if (Spec.quants.indexOf(maybeQuant)!==-1) return i;
    }
    return -1;
};

// bad thing: needs continuous string
LongSpec.prototype.findPattern = function (pattern, i) {
    if (typeof(pattern)==='string') {
        pattern = LongSpec.compilePattern(pattern);
    }
    if (i && typeof(i)!=='number') {
        i = i.index+1;
    }
    pattern.lastIndex = i;
    var m = pattern.exec( this.value );
    return m;
};

/** Convert an iterator to an offset. 
LongSpec.offset = function offset (i) {
    if (i===null || i===undefined) return -1;
    return typeof(i)==='number' ? i : i.lastIndex;
};*/

LongSpec.compilePattern = function cmpP (patternString) {
    var rs = patternString.replace(/=/g, LongSpec.rTEn);
    var regex = new RegExp( rs, 'g' );
    return regex;
};

LongSpec.prototype.match = function (m) {
    return m ? this.decode(m[0]) : undefined;
};

module.exports = LongSpec;
