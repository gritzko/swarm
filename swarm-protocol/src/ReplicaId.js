"use strict";
const Base64x64 = require('./Base64x64');

/** Replica id, immutable.
 *  https://gritzko.gitbooks.io/swarm-the-protocol/content/replica.html */
class ReplicaId {

    /** @param {Base64x64|String|Array} id
     *  @param {ReplicaIdScheme} scheme */
    constructor(id, scheme) {
        this._id = null;
        this._scheme = scheme;
        this._parts = [null,null,null,null];
        let base = null;
        if (id.constructor===Array) {
            if (id.length!==4)
                throw new Error("need all 4 parts");
            this._parts = id.map( (val, p) => scheme.slice(val, p) );
            this._id = scheme.join(this._parts);
        } else {
            base = new Base64x64(id);
            this._id = base.toString();
            this._parts = scheme.split(this._id);
        }
    }

    /** @param {Array} parts
     *  @param {ReplicaIdScheme} scheme */
    static createId (parts, scheme) {
        let full = '';
        for(let p=0, off=0; p<4; p++) {
            const len = scheme.partLength(p);
            if (len===0) continue;
            let segment = parts[p].substr(off, len) || '0';
            while (segment.length<len) segment = segment + '0';
            full += segment;
            off += len;
        }
        return new ReplicaId(full, scheme);
    }

    get primus () {return this._parts[0];}
    get peer () {return this._parts[1];}
    get client () {return this._parts[2];}
    get session () {return this._parts[3];}

    isPeer () {
        return this.client === '0';
    }

    isClient () {
        return !this.isPeer();
    }

    /** @param {ReplicaId} rid */
    isClientOf(rid) {
        return this.primus===rid.primus && this.peer===rid.peer &&
            this.isClient() && rid.isPeer();
    }

    toString () {
        return this._id;
    }

}

module.exports = ReplicaId;