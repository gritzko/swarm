"use strict";

var Spec = require('./Spec');
var SecondPreciseClock = require('./SecondPreciseClock');

/** An array of op ids in a compressed form.
 *  Using an array of base64 strings is a bit too wasteful sometimes.
 *  This one employs heuristics to compress base64 ids into variable-length
 *  Unicode "x-plets". Is supposed to compress Text state especially well
 *  as long ranges of uninterrupted typing create intervals of
 *  monotonically growing ids. */
function IdArray (param) {
    this.encoder = new IdArray.Encoder();
    this.body = '';  // FIXME store body in chunks to iterate less
    this._length = 0;
    if (param) {
        if (param.constructor===Array) {
            this.insert(param);
        } else if (('body' in param) && ('encoder' in param)) {
            // reverse of toPojo()
            this.body = param.body;
            this.encoder = new IdArray.Encoder(param.encoder);
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
        encoder: this.encoder.toPojo(),
        body: this.body,
        bookmarks: {} // enc4: offset // update on splice() TODO perf
        // also bookmark the last one
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

// returns base64 id at position pos
IdArray.prototype.at = function (pos) {
    var i = this.iterator(pos);
    return i.match ?
        this.encoder.decode(i.enc4) : undefined;
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
        encoded.push(this.encoder.encode(ids[j]));
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
    var last = this.encoder.decode(i.enc4);
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
    var head = iter.match ? this.body.substr(0, iter.index) : this.body;

    if (count) {
        if (count>this._length-iter.pos) {
            throw new Error("no such elements to delete");
        }
        iter.next(count);
    }

    if (iter.match) {
        tail = this.body.substr(iter.index+iter.match.length);
        // iter must stay valid, point to the 'till' point
        iter.index = head.length + insert_gz.length;
        iter.match = IdArray.compress(iter.enc4,prev);
        insert_gz += iter.match;
    }
    iter.prev = null;
    iter.pos = iter.pos - count + enc_ids.length;

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
    var i = this._find(this.encoder.encode(id));
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
    this.match = '';
    this.index = 0;
    this.pos = -1;
    this.enc4 = '     ';
    this.next();
};

Iterator.prototype.clone = function () {
    var c = new Iterator(this.id_array);
    c.prev = this.prev;
    c.match = this.match;
    c.index = this.index;
    c.pos = this.pos;
    c.enc4 = this.enc4;
    return c;
};

Iterator.prototype.id = function () {
    return this.id_array.encoder.decode(this.enc4);
};

Iterator.prototype.base64id = Iterator.prototype.id;

Iterator.prototype.end = function () {
    return this.match===null;
};

Iterator.prototype.goTo = function (pos) {
    if (pos<this.pos) { throw new Error("that pos is behind"); }
    this.next(pos-this.pos);
};

Iterator.prototype.next = function (steps) {
    var array = this.id_array;
    if (steps===undefined) { steps=1; }
    while (steps-->0) {
        if (this.match===null) { return undefined; }
        IdArray.re_xplet.lastIndex = this.index + this.match.length;
        this.prev = this.enc4;
        var m = IdArray.re_xplet.exec(array.body);
        if (m) {
            this.match = m[0];
            this.index = m.index;
            this.enc4 = IdArray.uncompress(this.match,this.prev);
        } else {
            this.match = null;
            this.index = -1;
            this.enc4 = null;
        }
        this.pos++;
    }
    return this;
};



var Encoder = IdArray.Encoder = function (sources) {
    if (sources) {
        this.sources = sources.split('+');
    } else {
        this.sources = [''];
    }
    /*this.src2id = {};
    for(var i=0; i<this.sources.length; i++) {
        this.src2i[this.sources[i]] = i;
    }*/
};

// decodes 4-symbol unicode back into base64 id
Encoder.prototype.decode = function (enc4) {
    if (enc4==='0000') {return '0';}
    var ints = [0,0,0,0];
    for(var i=0; i<4; i++) {
        ints[i] = enc4.charCodeAt(i)-0x30;
    }
    var parsed = {
        time:   (ints[0]<<15) | ints[1],
        seq:    ints[2],
        source: this.sources[ints[3]]
    };
    return SecondPreciseClock.unparseTimestamp(parsed);
};

//IdArray.rsTsSeqSrc = "!?(B{5})(B{2})?\\+(B+)".replace(/B/g, '[0-9A-Za-z_~]');
//IdArray.reTsSeqSrc = new RegExp(IdArray.rsTsSeqSrc);

Encoder.prototype.encode = function (tok) {
    if (tok.length<=2) {
        if (/^[!#]?0$/.test(tok)) { return '0000'; }
        throw new Error("malformed token: "+tok);
    }
    var parsed = SecondPreciseClock.parseTimestamp(tok);
    var ai = this.sources.indexOf(parsed.source); // TODO perf
    if (ai===-1) {
        ai = this.sources.length;
        this.sources.push(parsed.source);
    }
    return String.fromCharCode(
        (parsed.time>>15) + 0x30,
        (parsed.time&0x7fff) + 0x30,
        (parsed.seq) + 0x30,
        ai + 0x30
        //this.src2i['+'+parsed.source] + 0x30
    );
};

Encoder.prototype.toPojo = function () {
    return this.sources.join('+');
};
Encoder.prototype.toString = Encoder.prototype.toPojo;



var Uncompressed = IdArray.Uncompressed = function UncompressedArray(pojo, e) {
    if (pojo!==undefined && pojo.constructor===String) {
        this.encoder = e || null;
        this.body = pojo;
    } else if (pojo) {
        this.encoder = new Encoder(pojo.encoder);
        this.body = pojo.body;
    } else {
        this.body = '';
        this.encoder = new Encoder();
    }
};

Uncompressed.prototype.toPojo = function () {
    return {
        encoder: this.encoder.toPojo(),
        body: this.body
    };
};

Uncompressed.prototype._splice = function (iter, remove_count, insert_enc4) {
    if (!insert_enc4) {
        insert_enc4 = '';
    } else if (insert_enc4.constructor===Array) {
        insert_enc4 = insert_enc4.join('');
    }
    if (insert_enc4.replace(/[0-\u802f]{4}/g,'')) {
        throw new Error("malformed enc4 chunk",insert_enc4);
    }
    var head = this.body.substr(0,iter.pos<<2);
    var tail = this.body.substr((iter.pos+remove_count)<<2);
    this.body = head + insert_enc4 + tail;
    iter.pos += insert_enc4.length>>2;
    iter.enc4 = tail.substr(0,4);
};

Uncompressed.prototype.splice = function (pos, remove_count, insert_base64) {
    var insert_enc4 = '';
    for(var i=0; i<insert_base64.length; i++) {
        insert_enc4 += this.encoder.encode(insert_base64[i]);
    }
    var iter = this.iterator(pos);
    this._splice(iter, remove_count, insert_enc4);
};

Uncompressed.prototype._slice = function (offset, count) {
    var chunk = this.body.substr(offset<<2,count<<2);
    return chunk.match(/[0-\u802f]{4}/g);
};

Uncompressed.prototype.slice = function (offset, count) {
    var ids = this._slice(offset,count), encoder=this.encoder;
    return ids.map(function(enc4){
        return encoder.decode(enc4);
    });
};


Uncompressed.prototype._push = function (enc4) {
    this.body += enc4;
};

Uncompressed.prototype.push = function (base64id) {
    return this._push(this.encoder.encode(base64id));
};

Uncompressed.prototype._find = function (enc4, pos) {
    var i = (pos || 0) << 2;
    do {
        i = this.body.indexOf(enc4,i);
    } while (i!==-1 && (i&3)!==0 && i++);
    return new Uncompressed.Iterator
        (this, i===-1 ? this.body.length>>2 : i>>2);
};

Uncompressed.prototype.find = function (base64id, pos) {
    return this._find(this.encoder.encode(base64id), pos);
};

Uncompressed.prototype._at = function (offset) {
    return this.body.substr(offset<<2,4);
};

Uncompressed.prototype.at = function (offset) {
    return this.encoder.decode(this._at(offset));
};

Uncompressed.prototype.iterator = function (pos) {
    return new Uncompressed.Iterator(this,pos);
};


Uncompressed.Iterator = function (unc, pos) {
    this.array = unc;
    pos = pos || 0;
    this.pos = pos-1;
    this.next();
};

Uncompressed.Iterator.prototype.next = function () {
    this.pos++;
    this.enc4 = this.match = this.array.body.substr(this.pos<<2,4);
};

Uncompressed.Iterator.prototype.base64id = function () {
    return this.array.encoder.decode(this.enc4);
};

Uncompressed.Iterator.prototype.clone = function () {
    return new Uncompressed.Iterator(this.array, this.pos);
};
