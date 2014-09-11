"use strict";

var Spec = require('./Spec');

/** LongSpec is a Long Specifier, i.e. a string of quant+ids tokens that may be
 * indeed very (many megabytes) long.  Ids are compressed using
 * dynamic dictionaries (codebooks) or "unicode numbers" (base-32768
 * encoding utilizing Unicode symbols as quasi-binary).  Unicode
 * numbers are particularly handy for encoding timestamps.  LongSpecs
 * may be assigned shared codebooks (2nd parameter); a codebook is an
 * object containing encode/decode tables and some stats, e.g.
 * {en:{'/Type':'/T'}, de:{'/T':'/Type'}}. It is OK to pass an empty object as
 * a codebook; it gets initialized automatically).  */
var LongSpec = function (spec, codeBook) {
    var cb = this.codeBook = codeBook || {en:{},de:{}};
    if (!cb.en) { cb.en = {}; }
    if (!cb.de) { // revert en to make de
        cb.de = {};
        for(var tok in cb.en) {
            cb.de[cb.en[tok]] = tok;
        }
    }
    if (!cb.lastCodes) {
        cb.lastCodes = {'/':0x30,'#':0x30,'!':0x30,'.':0x30,'+':0x30};
    }
    // For a larger document, a single LongSpec may be some megabytes long.
    // As we don't want to rewrite those megabytes on every keypress, we
    // divide data into chunks.
    this.chunks = spec ? [this.encode(spec)] : []; // TODO iterator-insert
    this.chunkLengths = spec ? [this.chunks[0].match(LongSpec.reQTokExtEn).length] : []; // FIXME
};

LongSpec.reQTokEn = /([/#\!\.\+])([0-\u802f]+)/g;
LongSpec.reQTok = new RegExp('([/#\\.!\\*\\+])(=)'.replace(/=/g, Spec.rT), 'g');
LongSpec.rTEn = '[0-\\u802f]+';
LongSpec.reQTokExtEn = new RegExp
    ('([/#\\.!\\*])((=)(?:\\+(=))?)'.replace(/=/g, LongSpec.rTEn), 'g');

/** Well, for many-MB LongSpecs this may take some time. */
LongSpec.prototype.toString = function () {
    return this.decode(this.chunks.join('')).toString();
};

LongSpec.prototype.length = function () {
    var len = 0;
    for(var i=0; i<this.chunks.length; i++) {
        len += this.chunkLengths[i];
    }
    return len;
};

//   T O K E N  C O M P R E S S I O N

/* The method converts a (relatively) verbose Base64 specifier into an
 * internal compressed format.  Compressed tokens are also
 * variable-length; the length of the token depends on the encoding
 * method used.
 * 1 unicode symbol: dictionary-encoded (up to 2^15 entries for each quant),
 * 2 symbols: simple timestamp base-2^15 encoded,
 * 3 symbols: timestamp+seq base-2^15,
 * 4 symbols and more: unencoded original (fallback).
 * */
LongSpec.prototype.encode = function encode (spec) {
    if (!spec) { return ''; }
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
    var en, cb = this.codeBook, lc = cb.lastCodes;
    if (lc[quant]<'z'.charCodeAt(0)) { // pick a nice letter
        for(var i=1; !en && i<tok.length; i++) {
            var x = tok.charAt(i), e = quant+x;
            if (!cb.de[e]) {  en = e;  }
        }
    }
    while (!en && lc[quant]<0x802f) {
        var y = String.fromCharCode(lc[quant]++);
        var mayUse = quant + y;
        if ( ! cb.en[mayUse] ) {  en = mayUse;  }
    }
    if (!en) {
        if (tok.length<=3) { throw new Error("out of codes"); }
        en = tok;
    }
    cb.en[tok] = en;
    cb.de[en] = tok;
    return en;
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

//  F O R M A T  C O N V E R S I O N

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
    for(; i>0; i>>=15) {
        ret = String.fromCharCode(0x30+(i&0x7fff)) + ret;
    }
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

//  I T E R A T O R S

/*  Unfortunately, LongSpec cannot be made a simple array because tokens are
    not fixed-width in the general case. Some tokens are dictionary-encoded
    into two-symbol segments, e.g. ".on" --> ".o". Other tokens may need 6
    symbols to encode, e.g. "!timstse+author~ssn" -> "!tss+a".
    Also, iterators opportuniatically use sequential compression. Namely,
    tokens that differ by +1 are collapsed into quant-only sequences:
    "!abc+s!abd+s" -> "!abc+s!"
    So, locating and iterating becomes less-than-trivial. Raw string offsets
    better not be exposed in the external interface; hence, we need iterators.

    {
        offset:5,       // char offset in the string (chunk)
        index:1,        // index of the entry (token)
        en: "!",        // the actual matched token (encoded)
        chunk:0,        // index of the chunk
        de: "!timst00+author~ssn", // decoded token
        seqstart: "!ts0+a", // first token of the sequence (encoded)
        seqoffset: 3    // offset in the sequence
    }
*/
LongSpec.Iterator = function LongSpecIterator (owner, index) {
    this.owner = owner;         // our LongSpec
    this.chunk = 0;             // the chunk we are in
    this.index = -1;            // token index (position "before the 1st token")
    this.chunkIndex = -1;       // token index within the chunk
    this.prevFull = undefined;  // previous full (non-collapsed) token
    //  seqStart IS the previous match or prev match is trivial
    this.prevCollapsed = 0;
    this.match = null;
    this.next();
    if (index) { this.skip(index); }
};

// also matches collapsed quant-only tokens
LongSpec.Iterator.reTok = new RegExp
    ('([/#\\.!\\*])((=)(?:\\+(=))?)?'.replace(/=/g, LongSpec.rTEn), 'g');

LongSpec.Iterator.prototype.next = function ( ) {

    if (this.end()) {return;}

    var re = LongSpec.Iterator.reTok;
    re.lastIndex = this.match ? this.match.index+this.match[0].length : 0;
    var chunk = this.owner.chunks[this.chunk];

    if (chunk.length===re.lastIndex) {
        this.chunk++;
        this.chunkIndex = -1;
        this.match = null;
        this.prevFull = undefined;
        this.prevCollapsed = 0;
        if (this.end()) {return;}
    }

    this.match = re.exec(chunk);
    this.index++;
    this.chunkIndex++;

    if (this.match[0].length>1) {
        this.prevFull = this.match;
        this.prevCollapsed = 0;
    }

    return this.match[0];
};

LongSpec.Iterator.prototype.end = function () {
    return this.match===null && this.chunk===this.owner.chunks.length;
};

LongSpec.Iterator.prototype.skip = function ( count ) {
    // TODO may implement fast-skip of seq-compressed spans
    var o = this.owner, ret;
    count = count || 1;
    var left = count;
    while (left && !this.end()) {
        var leftInChunk = o.chunkLengths[this.chunk] - this.chunkIndex -1;
        if ( leftInChunk < left ) { // < not =<
            // position "before the first token of the next chunk"
            this.index += leftInChunk; // -1
            this.chunkIndex = -1;
            this.chunk++;
            this.prevFull = undefined;
            this.prevCollapsed = 0;
            this.match = null;
            left -= leftInChunk;// > 0 here as we need to make a match
        } else {
            this.next(); // TODO nicer while loop
            left--;
        }
    }
    return count - left;
};

LongSpec.Iterator.prototype.token = function () {
    if (this.match===null) { return undefined; }
    if (this.match[0].length>1) { return this.match[0]; }
    // inc FIXME
    var prev = this.prevFullMatch, pq = prev[1], pseq = prev;
    var seq = prevseq.charCodeAt(0);
};

LongSpec.Iterator.prototype.de = function () {
    var tok = this.token();
    return tok===undefined ? undefined : this.owner.decode(tok);
};

LongSpec.Iterator.prototype.insertDe = function (de) {
    var en = this.owner.encode(de);
    this.insert(en);
};

/** As sequential coding is incapsulated in LongSpec.Iterator, inserts are
  * done by Iterator as well. */
LongSpec.Iterator.prototype.insert = function (en) { // insertBefore
    // if (me end) then append

    var re = LongSpec.reQTokExtEn, m;
    re.lastIndex = 0;
    var prev = this.seqLength ? 123 : this.seqStart;
    var chain = [];
    while (m=re.exec(en)) {
        var seqpos = (m[0].indexOf('+'));
        /*  +1
            if ( prev.length===match.length &&
             prev.substr(0,seqpos)!==match.substr(0,seqpos) &&
             false ) {
                 chain.push(quant);
             } else {
                 chain.push(match);
             }*/
        prev = m;
        chain.push(m[0]);
    }
    var insStr = chain.join('');

    var brokenSeq = this.match && this.match[0].length===1;
    /*if (brokenSeq) {
        chain.push(this.token());
    }*/

    if (this.chunkIndex===-1) { // inbetween chunks
        if (this.owner.chunks.length>0) {
            var ind = this.chunk - 1; //owner.chunks.length - 1;
            this.owner.chunks[ind] += insStr;
            this.owner.chunkLengths[ind] += chain.length;
        } else {
            this.owner.chunks.push(insStr);
            this.owner.chunkLengths.push(chain.length);
        }
    } else {
        var chunks = this.owner.chunks;
        var chunkStr = chunks[this.chunk];
        var preEq = chunkStr.substr(0, this.match.index);
        var postEq = chunkStr.substr(this.match.index);
        chunks[this.chunk] = preEq + insStr + /**/ postEq;
        this.owner.chunkLengths[this.chunk] += chain.length;
        this.chunkIndex += chain.length;
        this.match.index += insStr.length;
    }
    this.index += chain.length;

    this.prevFull = undefined; //?
    this.prevCollapsed = 0;

    // may split chunks
    // may join chunks
};


LongSpec.Iterator.prototype.erase = function (count) {
    if (this.end()) {return;}
    count = count || 1;
    var chunks = this.owner.chunks;
    var lengths = this.owner.chunkLengths;
    // remember offsets
    var fromChunk = this.chunk;
    var fromOffset = this.match.index;
    var fromChunkIndex = this.chunkIndex; // TODO clone USE 2 iterators or i+c

    count = this.skip(count); // checked for runaway skip()
    // the iterator now is at the first-after-erased pos

    var tillChunk = this.chunk;
    var tillOffset = this.match ? this.match.index : 0; // end()

    var collapsed = this.match && this.match[0].length===1;

    // splice strings, adjust indexes
    if (fromChunk===tillChunk) {
        var chunk = chunks[this.chunk];
        var pre = chunk.substr(0,fromOffset);
        var post = chunk.substr(tillOffset);
        if (collapsed) { // sequence is broken now; needs expansion
            post = this.token() + post.substr(1);
        }
        chunks[this.chunk] = pre + post;
        lengths[this.chunk] -= count;
        this.chunkIndex -= count;
    } else {
        chunks[fromChunk] = chunks[fromChunk].substr(0,fromOffset);
        lengths[fromChunk] = fromChunkIndex;
        var midChunks = tillChunk - fromChunk - 1;
        if (midChunks) { // wipe'em out
            //for(var c=fromChunk+1; c<tillChunk; c++) ;
            chunks.splice(fromChunk+1,midChunks);
            chunkLengths.splice(fromChunk+1,midChunks);
        }
        if (tillChunk<chunks.length) {
            chunks[tillChunk] = chunks[tillChunk].substr(this.match.index);
            lengths[tillChunk] -= this.chunkIndex;
            this.chunkIndex = 0;
        }
    }
    this.index -= count;

};


LongSpec.Iterator.prototype.clone = function () {
    var copy = new LongSpec.Iterator(this.owner);
    copy.chunk = this.chunk;
    copy.match = this.match;
    copy.index = this.index;
};

//  L O N G S P E C  A P I

LongSpec.prototype.iterator = function (index) {
    return new LongSpec.Iterator(this,index);
};

LongSpec.prototype.end = function () {
    return new LongSpec.Iterator(this,this.length()); // FIXME optimize
};

/** Insert a token at a given position.
LongSpec.prototype.insertBefore = function (tok, i) {
    var en = this.encode(tok);
    if (i===0) {
        this.value = en + this.value;
    } else if (i===-1 || i===this.value.length) {
        this.value = this.value + en;
    } else {
        var q = this.value.charAt(i);
        if (Spec.quants.indexOf(q)===-1) {
            throw new Error('mid-token offset');
        }
        var splitAt = i;
        var head = this.value.substr(0,splitAt),
            tail = this.value.substr(splitAt);
        this.value = head + en + tail;
    }
};

LongSpec.prototype.insertAfter = function (tok, i) {
    LongSpec.reQTokExtEn.lastIndex = i;
    var m = LongSpec.reQTokExtEn.exec(this.value);
    if (m.index!==i) { throw new Error('incorrect position'); }
    var splitAt = i+m[0].length;
    this.insertBefore(tok,splitAt);
};*/

LongSpec.prototype.add = function ls_add (spec) {
    var pos = this.end(); // FIXME iterator toEnd() as bzero!!!
    pos.insertDe(spec);
};
LongSpec.prototype.append = LongSpec.prototype.add;

/** The method finds the first occurence of a token, returns an
 * iterator.  While the internal format of an iterator is kind of
 * opaque, and generally is not recommended to rely on, that is
 * actually a regex match array. Note that it contains encoded tokens.
 * The second parameter is the position to start scanning from, passed
 * either as an iterator or an offset. */
LongSpec.prototype.find = function (tok, startIndex) {
    var en = this.encode(tok).toString(); // don't split on +
    var i = this.iterator(startIndex);
    while (!i.end()) {
        if (i.token()===en) {return i;}
        i.next();
    }
    return i;
};

/* bad thing: needs continuous string
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
};*/

/*LongSpec.compilePattern = function cmpP (patternString) {
    var rs = patternString.replace(/=/g, LongSpec.rTEn);
    var regex = new RegExp( rs, 'g' );
    return regex;
};

LongSpec.prototype.match = function (m) {
    return m ? this.decode(m[0]) : undefined;
};*/

module.exports = LongSpec;
