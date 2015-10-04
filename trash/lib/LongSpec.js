"use strict";

var Spec = require('./Spec');

/**LongSpec is a Long Specifier, i.e. a string of quant+id tokens that may be
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
    this.chunks = [];
    this.chunkLengths = [];
    if (spec) {
        this.append(spec);
    }
};

LongSpec.reQTokEn = /([/#\!\.\+])([0-\u802f]+)/g;
LongSpec.reQTok = new RegExp('([/#\\.!\\*\\+])(=)'.replace(/=/g, Spec.rT), 'g');
LongSpec.rTEn = '[0-\\u802f]+';
LongSpec.reQTokExtEn = new RegExp
    ('([/#\\.!\\*])((=)(?:\\+(=))?)'.replace(/=/g, LongSpec.rTEn), 'g');

/** Well, for many-MB LongSpecs this may take some time. */
LongSpec.prototype.toString = function () {
    var ret = [];
    for(var i = this.iterator(); !i.end(); i.next()){
        ret.push(i.decode());
    }
    return ret.join('');
};

LongSpec.prototype.length = function () { // TODO .length ?
    var len = 0;
    for(var i=0; i<this.chunks.length; i++) {
        len += this.chunkLengths[i];
    }
    return len;
};

LongSpec.prototype.charLength = function () {
    var len = 0;
    for(var i=0; i<this.chunks.length; i++) {
        len += this.chunks[i].length;
    }
    return len;
};

//   T O K E N  C O M P R E S S I O N

LongSpec.prototype.allocateCode = function (tok) {
    var quant = tok.charAt(0);
    //if (Spec.quants.indexOf(quant)===-1) {throw new Error('invalid token');}
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
        if (tok.length<=3) {
            throw new Error("out of codes");
        }
        en = tok;
    }
    cb.en[tok] = en;
    cb.de[en] = tok;
    return en;
};

//  F O R M A T  C O N V E R S I O N


/** Always 2-char base2^15 coding for an int (0...2^30-1) */
LongSpec.int2uni = function (i) {
    if (i<0 || i>0x7fffffff) { throw new Error('int is out of range'); }
    return String.fromCharCode( 0x30+(i>>15), 0x30+(i&0x7fff) );
};

LongSpec.uni2int = function (uni) {
    if (!/^[0-\u802f]{2}$/.test(uni)) {
        throw new Error('invalid unicode number') ;
    }
    return ((uni.charCodeAt(0)-0x30)<<15) | (uni.charCodeAt(1)-0x30);
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
LongSpec.Iterator = function Iterator (owner, index) {
    this.owner = owner;         // our LongSpec
    /*this.chunk = 0;             // the chunk we are in
    this.index = -1;            // token index (position "before the 1st token")
    this.chunkIndex = -1;       // token index within the chunk
    this.prevFull = undefined;  // previous full (non-collapsed) token
    //  seqStart IS the previous match or prev match is trivial
    this.prevCollapsed = 0;
    this.match = null;
    //this.next();*/
    this.skip2chunk(0);
    if (index) {
        if (index.constructor===LongSpec.Iterator) {
            index = index.index;
        }
        this.skip(index);
    }
};


// also matches collapsed quant-only tokens
LongSpec.Iterator.reTok = new RegExp
    ('([/#\\.!\\*])((=)(?:\\+(=))?)?'.replace(/=/g, LongSpec.rTEn), 'g');


/* The method converts a (relatively) verbose Base64 specifier into an
 * internal compressed format.  Compressed tokens are also
 * variable-length; the length of the token depends on the encoding
 * method used.
 * 1 unicode symbol: dictionary-encoded (up to 2^15 entries for each quant),
 * 2 symbols: simple timestamp base-2^15 encoded,
 * 3 symbols: timestamp+seq base-2^15,
 * 4 symbols: long-number base-2^15,
 * 5 symbols and more: unencoded original (fallback).
 * As long as two sequential unicoded entries differ by +1 in the body
 * of the token (quant and extension being the same), we use sequential
 * compression. The token is collapsed (only the quant is left).
 * */
LongSpec.Iterator.prototype.encode = function encode (de) {
    var re = Spec.reQTokExt;
    re.lastIndex = 0;
    var m=re.exec(de); // this one is de
    if (!m || m[0].length!==de.length) {throw new Error('malformed token: '+de);}
    var tok=m[0], quant=m[1], body=m[3], ext=m[4];
    var pm = this.prevFull; // this one is en
    var prevTok, prevQuant, prevBody, prevExt;
    var enBody, enExt;
    if (pm) {
        prevTok=pm[0], prevQuant=pm[1], prevBody=pm[3], prevExt=pm[4]?'+'+pm[4]:undefined;
    }
    if (ext) {
        enExt = this.owner.codeBook.en['+'+ext] || this.owner.allocateCode('+'+ext);
    }
    var maySeq = pm && quant===prevQuant && enExt===prevExt;
    var haveSeq=false, seqBody = '';
    var int1, int2, uni1, uni2;
    //var expected = head + (counter===-1?'':Spec.int2base(counter+inc,1)) + tail;
    if ( body.length<=4 ||          // TODO make it a switch
         (quant in LongSpec.quants2code) ||
         (tok in this.owner.codeBook.en) ) {  // 1 symbol by the codebook

        enBody = this.owner.codeBook.en[quant+body] ||
                 this.owner.allocateCode(quant+body);
        enBody = enBody.substr(1); // FIXME separate codebooks 4 quants
        if (maySeq) {// seq coding for dictionary-coded
            seqBody = enBody;
        }
    } else if (body.length===5) { // 2-symbol base-2^15
        var int = Spec.base2int(body);
        enBody = LongSpec.int2uni(int);
        if (maySeq && prevBody.length===2) {
            seqBody = LongSpec.int2uni(int-this.prevCollapsed-1);
        }
    } else if (body.length===7) { // 3-symbol base-2^15
        int1 = Spec.base2int(body.substr(0,5));
        int2 = Spec.base2int(body.substr(5,2));
        uni1 = LongSpec.int2uni(int1);
        uni2 = LongSpec.int2uni(int2).charAt(1);
        enBody = uni1 + uni2;
        if (maySeq && prevBody.length===3) {
            seqBody = uni1 + LongSpec.int2uni(int2-this.prevCollapsed-1).charAt(1);
        }
    } else if (body.length===10) { // 4-symbol 60-bit long number
        int1 = Spec.base2int(body.substr(0,5));
        int2 = Spec.base2int(body.substr(5,5));
        uni1 = LongSpec.int2uni(int1);
        uni2 = LongSpec.int2uni(int2);
        enBody = uni1 + uni2;
        if (maySeq && prevBody.length===4) {
            seqBody = uni1+LongSpec.int2uni(int2-this.prevCollapsed-1);
        }
    } else { // verbatim
        enBody = body;
        seqBody = enBody;
    }
    haveSeq = seqBody===prevBody;
    return haveSeq ? quant : quant+enBody+(enExt||'');
};
LongSpec.quants2code = {'/':1,'.':1};

/** Decode a compressed specifier back into base64. */
LongSpec.Iterator.prototype.decode = function decode () {
    if (this.match===null) { return undefined; }
    var quant = this.match[1];
    var body = this.match[3];
    var ext = this.match[4];
    var pm=this.prevFull, prevTok, prevQuant, prevBody, prevExt;
    var int1, int2, base1, base2;
    var de = quant;
    if (pm) {
        prevTok=pm[0], prevQuant=pm[1], prevBody=pm[3], prevExt=pm[4];
    }
    if (!body) {
        if (prevBody.length===1) {
            body = prevBody;
        } else {
            var l_1 = prevBody.length-1;
            var int = prevBody.charCodeAt(l_1);
            body = prevBody.substr(0,l_1) + String.fromCharCode(int+this.prevCollapsed+1);
        }
        ext = prevExt;
    }
    switch (body.length) {
        case 1:
            de += this.owner.codeBook.de[quant+body].substr(1); // TODO sep codebooks
            break;
        case 2:
            int1 = LongSpec.uni2int(body);
            base1 = Spec.int2base(int1,5);
            de += base1;
            break;
        case 3:
            int1 = LongSpec.uni2int(body.substr(0,2));
            int2 = LongSpec.uni2int('0'+body.charAt(2));
            base1 = Spec.int2base(int1,5);
            base2 = Spec.int2base(int2,2);
            de += base1 + base2;
            break;
        case 4:
            int1 = LongSpec.uni2int(body.substr(0,2));
            int2 = LongSpec.uni2int(body.substr(2,2));
            base1 = Spec.int2base(int1,5);
            base2 = Spec.int2base(int2,5);
            de += base1 + base2;
            break;
        default:
            de += body;
            break;
    }
    if (ext) {
        var deExt = this.owner.codeBook.de['+'+ext];
        de += deExt;
    }
    return de;
};


LongSpec.Iterator.prototype.next = function ( ) {

    if (this.end()) {return;}

    var re = LongSpec.Iterator.reTok;
    re.lastIndex = this.match ? this.match.index+this.match[0].length : 0;
    var chunk = this.owner.chunks[this.chunk];

    if (chunk.length===re.lastIndex) {
        this.chunk++;
        this.chunkIndex = 0;
        if (this.match && this.match[0].length>0) {
            this.prevFull = this.match;
            this.prevCollapsed = 0;
        } else if (this.match) {
            this.prevCollapsed++;
        } else { // empty
            this.prevFull = undefined;
            this.prevCollapsed = 0;
        }
        this.match = null;
        this.index ++;
        if (this.end()) {return;}
    }

    if (this.match[0].length>1) {
        this.prevFull = this.match;
        this.prevCollapsed = 0;
    } else {
        this.prevCollapsed++;
    }

    this.match = re.exec(chunk);
    this.index++;
    this.chunkIndex++;

    return this.match[0];
};


LongSpec.Iterator.prototype.end = function () {
    return this.match===null && this.chunk===this.owner.chunks.length;
};


LongSpec.Iterator.prototype.skip = function ( count ) {
    // TODO may implement fast-skip of seq-compressed spans
    var lengths = this.owner.chunkLengths, chunks = this.owner.chunks;
    count = count || 1;
    var left = count;
    var leftInChunk = lengths[this.chunk]-this.chunkIndex;
    if ( leftInChunk <= count ) { // skip chunks
        left -= leftInChunk; // skip the current chunk
        var c=this.chunk+1;    // how many extra chunks to skip
        while (left>chunks[c] && c<chunks.length) {
            left-=chunks[++c];
        }
        this.skip2chunk(c);
    }
    if (this.chunk<chunks.length) {
        while (left>0) {
            this.next();
            left--;
        }
    }
    return count - left;
};

/** Irrespectively of the current state of the iterator moves it to the
  * first token in the chunk specified; chunk===undefined moves it to
  * the end() position (one after the last token). */
LongSpec.Iterator.prototype.skip2chunk = function ( chunk ) {
    var chunks = this.owner.chunks;
    if (chunk===undefined) {chunk=chunks.length;}
    this.index = 0;
    for(var c=0; c<chunk; c++) { // TODO perf pick the current value
        this.index += this.owner.chunkLengths[c];
    }
    this.chunkIndex = 0;
    this.chunk = chunk;
    var re = LongSpec.Iterator.reTok;
    if ( chunk < chunks.length ) {
        re.lastIndex = 0;
        this.match = re.exec(chunks[this.chunk]);
    } else {
        this.match = null;
    }
    if (chunk>0) { // (1) chunks must not be empty; (2) a chunk starts with a full token
        var prev = chunks[chunk-1];
        var j = 0;
        while (Spec.quants.indexOf(prev.charAt(prev.length-1-j)) !== -1) { j++; }
        this.prevCollapsed = j;
        var k = 0;
        while (Spec.quants.indexOf(prev.charAt(prev.length-1-j-k))===-1) { k++; }
        re.lastIndex = prev.length-1-j-k;
        this.prevFull = re.exec(prev);
    } else {
        this.prevFull = undefined;
        this.prevCollapsed = 0;
    }
};

LongSpec.Iterator.prototype.token = function () {
    return this.decode();
};

/*LongSpec.Iterator.prototype.de = function () {
    if (this.match===null) {return undefined;}
    return this.owner.decode(this.match[0],this.prevFull?this.prevFull[0]:undefined,this.prevCollapsed);
};*/

/*LongSpec.Iterator.prototype.insertDe = function (de) {
    var en = this.owner.encode(de,this.prevFull?this.prevFull[0]:undefined,this.prevCollapsed);
    this.insert(en);
};*/


/** As sequential coding is incapsulated in LongSpec.Iterator, inserts are
  * done by Iterator as well. */
LongSpec.Iterator.prototype.insert = function (de) { // insertBefore

    var insStr = this.encode(de);

    var brokenSeq = this.match && this.match[0].length===1;

    var re = LongSpec.Iterator.reTok;
    var chunks = this.owner.chunks, lengths = this.owner.chunkLengths;
    if (this.chunk==chunks.length) { // end(), append
        if (chunks.length>0) {
            var ind = this.chunk - 1;
            chunks[ind] += insStr;
            lengths[ind] ++;
        } else {
            chunks.push(insStr);
            lengths.push(1);
            this.chunk++;
        }
    } else {
        var chunkStr = chunks[this.chunk];
        var preEq = chunkStr.substr(0, this.match.index);
        var postEq = chunkStr.substr(this.match.index);
        if (brokenSeq) {
            var me = this.token();
            this.prevFull = undefined;
            var en = this.encode(me);
            chunks[this.chunk] = preEq + insStr + en + postEq.substr(1);
            re.lastIndex = preEq.length + insStr.length;
            this.match = re.exec(chunks[this.chunk]);
        } else {
            chunks[this.chunk] = preEq + insStr + /**/ postEq;
            this.match.index += insStr.length;
        }
        lengths[this.chunk] ++;
        this.chunkIndex ++;
    }
    this.index ++;
    if (insStr.length>1) {
        re.lastIndex = 0;
        this.prevFull = re.exec(insStr);
        this.prevCollapsed = 0;
    } else {
        this.prevCollapsed++;
    }

    // may split chunks
    // may join chunks
};

LongSpec.Iterator.prototype.insertBlock = function (de) { // insertBefore
    var re = Spec.reQTokExt;
    var toks = de.match(re).reverse(), tok;
    while (tok=toks.pop()) {
        this.insert(tok);
    }
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
    } else {  // FIXME refac, more tests (+wear)
        if (fromOffset===0) {
            fromChunk--;
        } else {
            chunks[fromChunk] = chunks[fromChunk].substr(0,fromOffset);
            lengths[fromChunk] = fromChunkIndex;
        }
        var midChunks = tillChunk - fromChunk - 1;
        if (midChunks) { // wipe'em out
            //for(var c=fromChunk+1; c<tillChunk; c++) ;
            chunks.splice(fromChunk+1,midChunks);
            lengths.splice(fromChunk+1,midChunks);
        }
        if (tillChunk<chunks.length && tillOffset>0) {
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
    var e = new LongSpec.Iterator(this);
    e.skip2chunk(this.chunks.length);
    return e;
};

/** Insert a token at a given position. */
LongSpec.prototype.insert = function (tok, i) {
    var iter = i.constructor===LongSpec.Iterator ? i : this.iterator(i);
    iter.insertBlock(tok);
};

LongSpec.prototype.tokenAt = function (pos) {
    var iter = this.iterator(pos);
    return iter.token();
};

LongSpec.prototype.indexOf = function (tok, startAt) {
    var iter = this.find(tok,startAt);
    return iter.end() ? -1 : iter.index;
};

/*LongSpec.prototype.insertAfter = function (tok, i) {
    LongSpec.reQTokExtEn.lastIndex = i;
    var m = LongSpec.reQTokExtEn.exec(this.value);
    if (m.index!==i) { throw new Error('incorrect position'); }
    var splitAt = i+m[0].length;
    this.insertBefore(tok,splitAt);
};*/

LongSpec.prototype.add = function ls_add (spec) {
    var pos = this.end();
    pos.insertBlock(spec);
};
LongSpec.prototype.append = LongSpec.prototype.add;

/** The method finds the first occurence of a token, returns an
 * iterator.  While the internal format of an iterator is kind of
 * opaque, and generally is not recommended to rely on, that is
 * actually a regex match array. Note that it contains encoded tokens.
 * The second parameter is the position to start scanning from, passed
 * either as an iterator or an offset. */
LongSpec.prototype.find = function (tok, startIndex) {
    //var en = this.encode(tok).toString(); // don't split on +
    var i = this.iterator(startIndex);
    while (!i.end()) {
        if (i.token()===tok) {
            return i;
        }
        i.next();
    }
    return i;
};

module.exports = LongSpec;
