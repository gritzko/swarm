"use strict";

var Spec = require('./Spec');

/** An array of op ids in a compressed form.
 *  Using an array of base64 strings is a bit too wasteful sometimes.
 *  This one employs heuristics to compress base64 ids into variable-length
 *  Unicode "x-plets". Is supposed to compress Text state especially well
 *  as long ranges of uninterrupted typing create intervals of
 *  monotonically growing ids. */
function IdArray (param) {
    this.sources = [];
    this.body = '';  // FIXME store body in chunks to iterate less
    this._length = 0;
    if (param) {
        if (param.constructor===Array) {
            this.insert(param);
        } else if (param.body && param.sources) { // reverse of toPojo()
            this.body = param.body; // TODO check
            this.sources = param.sources;
        } else {
            throw new Error("init param not understood");
        }
    }
    // nice quirk: use tses younger than 2015 to store custom ids
}
module.exports = IdArray;

IdArray.re_xplet = /[\u1030-\u1fff]|[\u2030-\u2fff][0-\u802f]|[\u3030-\u3fff][0-\u802f]{2}|[\u4030-\u4fff][0-\u802f]{3}/g;

IdArray.prototype.toPojo = function () {
    return {
        sources: this.sources,
        body: this.body
    };
};

// returns an iterator: match/pos, context(prev)
IdArray.prototype._iter = function (pos) {
    IdArray.re_xplet.lastIndex = 0;
    var iter = { // BEGIN
        prev: null,
        value: null,
        match: IdArray.re_xplet.exec(this.body),
        pos: 0
    };
    iter.value = iter.match ? this._uncompress(iter.match[0],iter.prev) : null;
    if (pos) {
        while (iter.match &&  iter.pos<pos) {
            this._next(iter);
        }
    }
    return iter;
};

// advances the iterator by 1 position
IdArray.prototype._next = function (i) {
    if (!i.match) { return undefined; }
    IdArray.re_xplet.lastIndex = i.match.index + i.match[0].length;
    i.prev = i.value;
    i.match = IdArray.re_xplet.exec(this.body);
    i.value = i.match ? this._uncompress(i.match[0],i.prev) : null;
    i.pos++;
    return i;
};

// decodes 4-symbol unicode back into base64 id
IdArray.prototype._decode = function (enc4) {
    if (enc4==='0000') {return '0';}
    var ints = [0,0,0,0];
    for(var i=0; i<4; i++) {
        ints[i] = enc4.charCodeAt(i)-0x30;
    }
    var tsi = (ints[0]<<15) | ints[1];
    var ts = Spec.int2base(tsi);
    var seq = ints[2] ? Spec.int2base(ints[2],2) : '';
    var src = this.sources[ints[3]];
    return ts + seq + '+' + src;
};

// uncompresses an unicode xplet into 4-symbol unicode
IdArray.prototype._uncompress = function (xplet, enc4) {
    enc4 = enc4 || '     ';
    var code = xplet.charCodeAt(0), ret='';
    var regime = code >> 12;
    var seq = String.fromCharCode(code&0xfff);
    switch (regime) {
        case 1: ret = enc4[0]+enc4[1]+seq+enc4[3]; break;
        case 2: ret = enc4[0]+xplet[1]+seq+enc4[3]; break;
        case 3: ret = xplet[2]+xplet[1]+seq+enc4[3]; break;
        case 4: ret = xplet[2]+xplet[1]+seq+xplet[3]; break;
        default: throw new Error("format violation?!!");
    }
    return ret;
};

IdArray.prototype._at = function (i) {
    return this._uncompress(i.match[0],i.prev);
};

// returns base63 id at position pos
IdArray.prototype.at = function (pos) {
    var i = this._iter(pos);
    return i.match ?
        this._decode(this._at(i)) :
        undefined;
};

IdArray.rsTsSeqSrc = "!?(B{5})(B{2})?\\+(B+)".replace(/B/g, '[0-9A-Za-z_~]');
IdArray.reTsSeqSrc = new RegExp(IdArray.rsTsSeqSrc);

IdArray.prototype.encode = function (tok) {
    var m = tok.match (IdArray.reTsSeqSrc);
    if (!m) {
        if (/^[!#]?0$/.test(tok)) { return '0000'; }
        throw new Error("malformed token: "+tok);
    }
    var ts = m[1], seq = m[2], src = m[3];
    if (seq>Spec.MAX_SEQ) {throw new Error("4000Hz is the limit");}
    var tsi = Spec.base2int(ts);
    var ai = this.sources.indexOf(src); // TODO perf
    if (ai===-1) {
        ai = this.sources.length;
        this.sources.push(src);
    }
    return String.fromCharCode(
        (tsi>>15) + 0x30,
        (tsi&0x7fff) + 0x30,
        (seq ? Spec.base2int(seq) : 0) + 0x30,
        ai + 0x30
    );
};

IdArray.prototype._compress = function (enc4, prev_enc4) {
    var tail='', flag=0;
    var same_mask = 0;
    if (prev_enc4) {
        for(var i=0; i<4; i++) {
            if (enc4.charAt(i)===prev_enc4.charAt(i)) {
                same_mask |= (8>>i);
            }
        }
    }
    switch (same_mask) {
        case 15:
        case 13:    flag = 1<<12;
                    tail = '';
                    break;
        case 9:
        case 11:    flag = 2<<12;
                    tail = enc4[1];
                    break;
        case 1:     flag = 3<<12;
                    tail = enc4[1]+enc4[0];
                    break;
        default:    flag = 4<<12;
                    tail = enc4[1]+enc4[0]+enc4.charAt(3);
                    break;
    }
    var flagged_seq = String.fromCharCode(enc4.charCodeAt(2) | flag);
    return flagged_seq + tail;
};

IdArray.prototype._insert = function (enc_ids, iter) {
    var compressed = '';
    var prev = iter.prev;
    for(var j=0; j<enc_ids.length; j++){
        compressed += this._compress(enc_ids[j],prev);
        prev = enc_ids[j];
    }
    var head = iter.match ? this.body.substr(0, iter.match.index) : this.body;
    var tail = '';
    if (iter.match) {
        compressed += this._compress(this._at(iter),prev);
        tail = this.body.substr(iter.match.index+iter.match[0].length);
    }
    this.body = head + compressed + tail;
    this._length += enc_ids.length;
};

/** Arguments: the id (or an array of ids) and its position-to-be
  * (default: 0, i.e. prepend) */
IdArray.prototype.insert = function (ids, pos) {
    var encoded = [];
    if (ids.constructor===String) {
        ids = [ids];
    }
    for(var j=0; j<ids.length; j++) {
        encoded.push(this.encode(ids[j]));
    }
    var i = this._iter(pos);
    this._insert(encoded,i);
};

IdArray.prototype.length = function () {
    return this._length;
};

IdArray.prototype.push = function (something) {
    this.insert(something, this._length);
};

IdArray.prototype.pop = function () {
    if (!this._length) { return undefined; }
    var i = this._iter(this._length-1);
    var last = this._decode(this._at(i));
    this._remove(i);
    return last;
};

IdArray.prototype._remove = function (iter, count) {
    if (!iter || !iter.match) {return undefined;}
    count = count || 1;
    var prev = iter.prev;
    var head = this.body.substr(0,iter.match.index);
    var recoded='', tail='';
    for (var c=0; c<count && iter.match; c++) {
        this._next(iter);
    }
    if (iter.match) {
        tail = this.body.substr(iter.match.index + iter.match[0].length);
        recoded = this._compress(this._at(iter), prev);
    }
    this.body = head + recoded + tail;
    this._length -= c;
    return c;
};

IdArray.prototype.remove = function (pos, count) {
    var i = this._iter(pos);
    return i.match ? this._remove(i, count) : 0;
};

IdArray.prototype.splice = function (pos, delete_count, add) {
    if (delete_count) {
        this.remove(pos,delete_count);
    }
    if (add) {
        this.insert(add, pos);
    }
};

IdArray.prototype._find = function (enc4, startOffset) {
    // TODO seek full form matching ts0
    // then iterate
    var i = this._iter(startOffset);
    while (i.match && i.value!==enc4) {
        this._next(i);
    }
    return i;
};

IdArray.prototype.find = function (id) {
    var i = this._find(this.encode(id));
    return i.match ? i.pos : -1;
};
