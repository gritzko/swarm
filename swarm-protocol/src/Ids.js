"use strict";
const Id = require('./Id');
const Spec = require('./Spec');
const Base64x64 = require('./Base64x64');

/** immutable id array */
class Ids {

    constructor(body) {
        this._body = body || '';
        this._length = -1;
    }

    static fromString(str) {
        return new Ids(str);
    }

    toString() {
        return this._body;
    }

    static as(ids) {
        if (!ids)
            return new Ids();
        if (ids.constructor===Ids)
            return ids;
        return new Ids(ids);
    }

    static is(ids) {
        return Ids.ids_re.test(ids);
    }

    // --- access/edit API ---

    /** @returns {Ids} -- new array */
    splice(offset, del_count, inserts) {
        const b = new Builder();
        const i = this.iterator();
        // append runs
        while (!i.end && i.run_end_offset < offset) {
            b.appendRun(i.open_run);
            i.nextRun();
        }
        // open split run
        // add that many
        while (!i.end && i.offset < offset) {
            b.append(i.id);
            i.nextId();
        }
        // add new
        inserts.forEach(id => b.append(id));
        // skip the deleted
        for (let j = 0; j < del_count && !i.end; j++)
            i.nextId();
        // add the rest
        while (!i.end && i.run_offset > 0) {
            b.append(i.nextId());
        }
        // append remaining runs
        while (!i.end) {
            b.appendRun(i.open_run);
            i.nextRun();
        }

        return new Ids(b.toString());
    }

    at(pos) {
        // FIXME span skip
        const i = this.iterator();
        while (!i.end && i.offset<pos)
            i.nextId();
        return i.end ? undefined : i.id;
    }

    /** @returns {Number} -- the first position the id was found at */
    find(id) {
        const seek = Id.as(id);
        const i = this.iterator();
        while (!i.end && !seek.eq(i.id))
            i.next(); // FIXME span skip
        return i.end ? -1 : i.offset; // FIXME
    }

    _runScan () {
        const i = this.iterator();
        while (!i.end)
            i.nextRun();
        this._length = i.offset;
    }

    get length () {
        if (this._length===-1)
            this._runScan();
        return this._length;
    }

    iterator() {
        return new Iterator(this);
    }

    [Symbol.iterator]() {
        return this.iterator();
    }

    static fromIdArray (id_array) {
        const b = new Builder();
        id_array.forEach( id => b.append(id) );
        return new Ids(b.toString());
    }

    toArray () {
        const ret = [];
        for(let id of this)
            ret.push(id);
        return ret;
    }

}

Ids.UNI_RUN = ',';
Ids.LAST1_RUN = "'";
Ids.LAST2_RUN = '"';
Ids.INC_RUN = '`';

/** A run of a single id. */
class IdRun {
    constructor (id) {
        this.id = Id.as(id);
    }
    append (new_id) {
        const id = Id.as(new_id);
        if (this.id.eq(id))
            return new UniRun(this.id).append(id);
        if (!this.id.isSameOrigin(id))
            return null;
        if (this.id.value.length===1)
            return null;
        const prefix = Base64x64.commonPrefix(this.id.value, id.value);
        if (prefix.length+1>=this.id.value.length && prefix.length+1>=id.value.length)
            return new Last1Run(this.id).append(id);
        if (prefix.length+2>=this.id.value.length && prefix.length+2>=id.value.length)
            return new Last2Run(this.id).append(id);
        return null;
    }
    at (i) {
        return i===0 ? this.id : undefined;
    }
    get length () {
        return 1;
    }
    toString () {
        return this.id.toString();
    }
    /** @returns {Boolean} */
    mayHave (id) {
        return this.id.eq(id);
    }
    static fromString (str) {
        Ids.reRun.lastIndex = 0;
        const m = Ids.reRun.exec(str);
        return m ? IdRun.fromMatch(m) : null;
    }
    static fromMatch (m) {
        const value = m[1], origin = m[2], run_type = m[3], tail = m[4];
        const id = new Id(value, origin), len = value.length;
        switch (run_type) {
            case Ids.UNI_RUN: return new UniRun(id, tail);
            case Ids.LAST1_RUN: return new Last1Run(id, value.substr(0,len-1), tail);
            case Ids.LAST2_RUN: return new Last2Run(id, value.substr(0,len-2), tail);
            case undefined: return new IdRun(id);
            default: throw new Error('parsing fail');
        }
    }
    static as (run_or_string) {
        if (run_or_string instanceof IdRun)
            return run_or_string;

    }
}


class UniRun extends IdRun {
    constructor (id, count) {
        super(id);
        this.count = count ? Base64x64.base2int(count) : 1;
    }
    toString () {
        return this.id + Ids.UNI_RUN + Base64x64.int2base(this.count, 1);
    }
    at (i) {
        return i>=0 && i<this.count ? this.id : undefined;
    }
    append (new_id) {
        const id = Id.as(new_id);
        if (this.id.eq(id)) {
            this.count++;
            return this;
        }
        if (this.id.value.length===1)
            return null;
        // const prefix = Base64x64.commonPrefix(id.value, this.id.value);
        // FIXME encapsulate
        // if (prefix.length+1>=this.id.value.length && prefix.length+1>=id.value.length)
        //     return new Last1Run(this.id).append(id);
        // if (prefix.length+2>=this.id.value.length && prefix.length+2>=id.value.length)
        //     return new Last2Run(this.id).append(id);
        return null;
    }
    get length () {
        return this.count;
    }
}


class Last1Run extends IdRun {
    constructor (id, prefix, tail) {
        super(id);
        this.tail = tail || '';
        this.prefix = null;
    }
    toString () {
        return this.id.value + '-' + this.id.origin + Ids.LAST1_RUN + this.tail;
    }
    at (i) {
        if (i<0 || i>this.tail.length)
            return undefined;
        if (i===0)
            return this.id;
        const val1 = this.id.value;
        let value = val1.substr(0, val1.length-1) + this.tail.charAt(i-1);
        return new Id(value, this.id.origin);
    }
    append (new_id) {
        const id = Id.as(new_id);
        if (id.origin!==this.id.origin)
            return null;
        const common = Base64x64.commonPrefix(this.id.value, id.value);
        const tivl = this.id.value.length, ivl = id.value.length, cl = common.length;
        if (ivl===tivl && cl===tivl-1) {
            this.tail += id.value.substr(ivl-1, 1) || '0';
            return this;
        } else if ( (cl===tivl-1 && ivl===tivl+1) ||
                    (cl===tivl-2 && ivl===tivl) ) {
            if (this.length>10) return null;
            const last2 = new Last2Run(this.id);
            for(let i=1; i<this.length; i++)
                last2.append(this.at(i));
            return last2;
        } else {
            return null;
        }
    }
    mayHave (id_to_seek) {
        const id = Id.as(id_to_seek);
        if (this.id.origin!==id.origin) return false;
        const prefix = Base64x64.commonPrefix(this.id.value, id.value);
        if (prefix.length<this.id.value.length-1) return false;
        if (id.value.length>prefix.length+1) return false;
        return true;
    }
    get length () {
        return 1 + this.tail.length;
    }
}


class Last2Run extends IdRun {
    constructor (id, prefix, tail) {
        super(id);
        this.prefix = prefix || null; // FIXME either-or
        this.tail = tail || '';
    }
    static fromString (str) {
        const m=null;
        return Last2Run.fromMatch(m);
    }
    static fromMatch (m) {

    }
    /** @returns {IdRun} */
    append (new_id) {
        const id = Id.as(new_id);
        if (id.origin!==this.id.origin)
            return null;
        if (!this.prefix)
            this.prefix = Base64x64.commonPrefix(this.id.value, id.value);
        const common = Base64x64.commonPrefix(this.prefix, id.value);
        const plen = this.prefix.length;
        if (common.length==plen && id.value.length <= plen+2) {
            let last2 = id.value.substr(this.prefix.length);
            while (last2.length<2) last2 += '0';
            this.tail += last2;
            return this;
        } else {
            return null;
        }
    }
    at (i) {
        if (i===0) return this.id;
        const last2 = this.tail.substr(i*2-2, 2);
        return new Id(this.prefix+last2, this.id.origin);
    }
    toString() {
        return this.id.toPaddedString(this.prefix.length+2) +
            Ids.LAST2_RUN + this.tail;
    }
    mayHave (id_to_seek) {
        const id = Id.as(id_to_seek);
        if (this.id.origin!==id.origin) return false;
        const prefix = Base64x64.commonPrefix(this.id.value, id.value);
        if (prefix.length<this.id.value.length-2) return false;
        if (id.value.length>prefix.length+2) return false;
        return true;
    }
    get length () {
        return 1 + (this.tail.length>>1);
    }
}


class Builder {

    constructor () {
        this.runs = []; // FIXME toString em
        this.open_run = null;
        this.str = null;
        this.quant = '@';
    }

    appendRun (run_or_str) {
        const run = IdRun.as(run_or_str);
        if (this.open_id) {
            this.runs.push(new IdRun(this.open_id));
            this.open_id = null;
        }
        this.runs.push(run.toString());
        this.str = null;
    }

    append (new_id) {
        this.str = null;
        const id = Id.as(new_id);
        if (this.open_run) {
            const next = this.open_run.append(id);
            if (next===null) {
                this.runs.push(this.open_run.toString());
                this.open_run = new IdRun(id);
            } else {
                this.open_run = next;
            }
        } else {
            this.open_run = new IdRun(id);
        }
    }

    toString () {
        if (this.str)
            return this.str;
        this.str = this.runs.length ? this.quant + this.runs.join(this.quant) : '';
        if (this.open_run)
            this.str += this.quant + this.open_run.toString();
        return this.str;
    }
}


class Iterator {
    /** @param {Ids} ids */
    constructor (ids) {
        this.body = ids._body;
        this.body_offset = 0;
        this.offset = 0;
        this.run_offset = 0;
        this.open_run = null;
        this.nextRun();
    }
    get id () {
        return this.open_run ? this.open_run.at(this.run_offset) : undefined;
    }
    next () {
        const ret = {
            value: this.id,
            done:  this.end
        };
        this.nextId();
        return ret;
    }
    nextId () {
        if (this.end)
            return undefined;
        const ret = this.id;
        if (this.run_offset<this.open_run.length-1) {
            this.run_offset++;
            this.offset++;
        } else {
            this.nextRun();
        }
        return ret;
    }
    nextRun () {
        Ids.reRun.lastIndex = this.body_offset;
        const m = Ids.reRun.exec(this.body);
        if (this.open_run)
            this.offset += this.open_run.length - this.run_offset;
        this.open_run = m ? IdRun.fromMatch(m) : null;
        this.run_offset = 0;
        this.body_offset = m ? m.index + m[0].length : -1;
    }
    get run_end_offset () {
        return this.offset - this.run_offset + this.open_run.length;
    }
    runMayHave (id) {
        return this.open_run.mayHave(id);
    }
    get end () {
        return !this.open_run;
    }

}

Ids.rsRun = Spec.rsQuant +
            Id.rsTokExt +
            '(?:([\,\'\"\;])' +
            '(' + Base64x64.rs64 + '+))?';
Ids.reRun = new RegExp(Ids.rsRun, 'g');

Ids.Builder = Builder;
Ids.Iterator = Iterator;
module.exports = Ids;