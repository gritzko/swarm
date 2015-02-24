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
            this.body = param.body;
            this.sources = param.sources;
            var i = this.iterator();
            while (i.match) {
                this._length++;
                i.next();
            }
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
IdArray.prototype.iterator = function (pos) {
    var iter = new IdArray.Iterator(this);
    if (pos) {
        iter.next(pos);
    }
    return iter;
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
// TODO make static
IdArray.uncompress = function (xplet, enc4) {
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

// returns base63 id at position pos
IdArray.prototype.at = function (pos) {
    var i = this.iterator(pos);
    return i.match ?
        this._decode(i.enc4) : undefined;
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

IdArray.compress = function (enc4, prev_enc4) {
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
    this._splice(iter,0,enc_ids);
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
    var i = this.iterator(pos);
    this._insert(encoded,i);
};

IdArray.prototype.length = function () {
    return this._length;
};

IdArray.prototype.push = function (something) {
    // FIXME perf: no full pass
    this.insert(something, this._length);
};

IdArray.prototype.pop = function () {
    if (!this._length) { return undefined; }
    var i = this.iterator(this._length-1);
    var last = this._decode(i.enc4);
    this._remove(i);
    return last;
};

IdArray.prototype._splice = function (iter, count, enc_ids) {
    if (!iter) {return undefined;}
    count = count || 0;
    enc_ids = enc_ids || [];
    if (enc_ids.constructor!==Array) { enc_ids=[enc_ids]; }

    var prev = iter.prev;
    var insert_gz = '';
    for(var j=0; j<enc_ids.length; j++){
        insert_gz += IdArray.compress(enc_ids[j],prev);
        prev = enc_ids[j];
    }

    var tail = '';
    var head = iter.match ? this.body.substr(0, iter.match.index) : this.body;

    if (count) {
        if (count>this._length-iter.pos) {
            throw new Error("no such elements to delete");
        }
        iter.next(count);
    }

    if (iter.match) {
        insert_gz += IdArray.compress(iter.enc4,prev);
        tail = this.body.substr(iter.match.index+iter.match[0].length);
    }

    this.body = head + insert_gz + tail;
    this._length = this._length - count + enc_ids.length;
};

IdArray.prototype._remove = function (iter, count) {
    this._splice(iter,count||1,null);
};

IdArray.prototype.remove = function (pos, count) {
    var i = this.iterator(pos);
    return i.match ? this._remove(i, count) : 0;
};

IdArray.prototype.splice = function (pos, delete_count, add) {
    if (delete_count) { // FIXME _splice
        this.remove(pos,delete_count);
    }
    if (add) {
        this.insert(add, pos);
    }
};

IdArray.prototype._find = function (enc4, iter) {
    // TODO seek full form matching ts0
    // then iterate
    var i = iter || this.iterator();
    while (i.match && i.enc4!==enc4) {
        i.next();
    }
    return i;
};

IdArray.prototype.find = function (id) {
    var i = this._find(this.encode(id));
    return i.match ? i.pos : -1;
};

IdArray.prototype.toString = function () {
    var ret = [];
    for(var i=this.iterator(); i.match; i.next()) {
        ret.push(i.id());
    }
    return ret.join(',');
};

var Iterator = IdArray.Iterator = function (id_array) {
    this.id_array = id_array;
    this.prev = null;
    IdArray.re_xplet.lastIndex = 0;
    var m = this.match = IdArray.re_xplet.exec(id_array.body); // TODO next()
    this.pos = 0;
    this.enc4 = m ? IdArray.uncompress(m[0],'     ') : null;
};

Iterator.prototype.id = function () {
    return this.id_array._decode(this.enc4);
};

Iterator.prototype.base64id = Iterator.prototype.id;

Iterator.prototype.end = function () {
    return this.match===null;
};

Iterator.prototype.goTo = function (pos) {
    if (pos<this.pos) { throw new Error("that pos is behind"); }
    if (pos>this.pos) {
        this.next(pos-this.pos);
    }
};

Iterator.prototype.next = function (steps) {
    var i = this, array = this.id_array;
    if (steps===undefined) { steps=1; }
    while (steps-->0) {
        if (!i.match) { return undefined; }
        IdArray.re_xplet.lastIndex = i.match.index + i.match[0].length;
        i.prev = i.enc4;
        i.match = IdArray.re_xplet.exec(array.body);
        i.enc4 = i.match ? IdArray.uncompress(i.match[0],i.prev) : null;
        i.pos++;
    }
    return i;
};
