"use strict";
const Base = require("./Base64x64");
const UUID = require("./UUID");

/** Cheap append-only UUID vector. Uses the bracket notation. */
class UUIDVector {

    constructor (body) {
        this._body = body ? body.toString() : '';
        this._last = body ? null : UUID.ZERO;
        this._array = null; // TODO
        this._map = null;
    }

    push (uid) {
        const uuid = UUID.as(uid);
        const last = this._last;
        if (this._array)
            this._array.push(uuid);
        if (this._map)
            this._map[uuid.origin] = uuid.time;
        this._last = uuid;
        if (!this._body || !last) {
            this._body = uuid.toString();
            return;
        }
        if (uuid.eq(last)) {
            this._body += ',';
        } else {
            let t = Base.compress(uuid.time, last.time);
            const c = (this._body && this._body[this._body.length-1]===',') ? ',':'';
            this._body += t ? c+t : ',' + uuid.time;
            let o = Base.compress(uuid.origin, last.origin);
            this._body += o ? o : UUID.TIMESTAMP_SEPARATOR + uuid.origin;
        }
    }

    pushAll (iterable) {
        for(let uid of iterable)
            this.push(uid);
    }

    static is (obj) {
        UUIDVector.RE_UUID_VEC.lastIndex = 0;
        return obj!==null && obj!==undefined && UUIDVector.RE_UUID_VEC.test(obj);
    }

    static as (obj) {
        if (!obj) return new UUIDVector();
        if (obj.constructor===UUIDVector) return obj;
        return UUIDVector.fromString(obj);
    }

    static fromString (string) {
        if (!UUIDVector.is(string))
            throw new Error("not a UUID vector");
        return new UUIDVector(string.toString());
    }

    static fromArray (uid_array) {
        const ret = new UUIDVector();
        ret.pushAll(uid_array);
        return ret;
    }

    static fromMap (vv) {
        const ret = new UUIDVector();
        const keys = Object.keys(vv).sort();
        keys.forEach(origin => {ret.push(new UUID(vv[origin], origin));});
        return ret;
    }

    toMap () {
        if (!this._map) {
                this._map = Object.create(null);
            for (let uid of this)
                this._map[uid.origin] = uid.time;
        }
        return this._map;
    }

    toArray () {
        if (this._array)
            return this._array;
        const ret = this._array = [];
        for(let id of this)
            ret.push(id);
        return ret;
    }

    at (i) {
        return this.toArray()[i];
    }

    toString() {
        return this._body;
    }

    [Symbol.iterator] () {
        return new Iterator(this._body);
    }

    splice(offset, del_count, inserts) {
        const b = new UUIDVector();
        const i = this.iterator();
        while (i._position<offset) { // TODO skip recoding, use the string
            const n = i.next();
            if (n.done) break;
            b.push(n.value);
        }
        while (i._position<offset+del_count) {
            const n = i.next();
            if (n.done) break;
        }
        if (inserts) for(let uid of inserts)
            b.push(uid);
        return b;
    }

    covers (uid) {
        const uuid = UUID.as(uid);
        const map = this.toMap();
        const t = map[uuid.origin] || '0';
        return t >= uuid.time;
    }

    coversAll (uids) {
        for(let uid of uids)
            if (!this.covers(uid))
                return false;
        return true;
    }

    clone () {
        return new UUIDVector(this._body);
    }

}

class Iterator {
    constructor (body) {
        this._body = body.toString();
        this._offset = 0;
        this._position = -1;
    }
    next () {
        if (this._offset===this._body.length)
            return {done: true, value: null};
        UUIDVector.RE_UUID_VEC_INT_G.lastIndex = this._offset;
        const m = UUIDVector.RE_UUID_VEC_INT_G.exec(this._body);
        if (!m || !m[0])
            return {done:true, value:"syntax error at "+this._offset};
        const uuid = m[1] ? UUID.fromString(m[1], this._last) : this._last;
        this._last = uuid;
        this._position++;
        this._offset += m[0].length;
        return {
            done: false,
            value: uuid
        };
    }
}

UUIDVector.SEPARATOR  =',';
UUIDVector.RS_UUID_VEC_INT = ',?(' + UUID.RS_ZIP_UUID + ')?';
UUIDVector.RE_UUID_VEC_INT_G = new RegExp(UUIDVector.RS_UUID_VEC_INT, 'g');

module.exports = UUIDVector;
