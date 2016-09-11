"use strict";
const Base64x64 = require('./Base64x64');

/** A replica id scheme, an immutable object.
 * see https://gritzko.gitbooks.io/swarm-the-protocol/content/replica.html */
class ReplicaIdScheme {

    /** @param {Number|String} formula - scheme formula, e.g. `"0262"`, `181`... */
    constructor (formula) {
        if (formula===undefined)
            formula = ReplicaIdScheme.DEFAULT_SCHEME;
        if ((formula).constructor===Number)
            formula = '' + formula;
        if (formula.length===3)
            formula = '0' + formula;
        if (!ReplicaIdScheme.FORMAT_RE.test(formula))
            throw new Error('invalid replica id scheme formula');
        this._formula = formula;
        let p = this._parts = formula.match(/\d/g).map(d=>parseInt(d));
        if (!this.isCorrect())
            throw new Error('inconsistent replica id scheme formula');
        this._offsets = [0, p[0], p[0]+p[1], p[0]+p[1]+p[2]];
    }

    get primuses () {return this._parts[0];}
    get peers () {return this._parts[1];}
    get clients () {return this._parts[2];}
    get sessions () {return this._parts[3];}

    /** @param {Number} i */
    partLength(i) {
        return this._parts[i];
    }

    length (p) { return this.partLength(p); }

    partOffset (i) {
        return this._offsets[i];
    }

    offset (p) { return this.partOffset(p); }

    split (base) {
        base = new Base64x64(base);
        const ret = [null,null,null,null];
        for(let p=0; p<4; p++)
            ret[p] = base.slice(this.offset(p), this.length(p)).toString();
        return ret;
    }

    join (parts) {
        let ret = '';
        for(let p=0; p<4; p++)
            ret +=  new Base64x64(parts[p]).toFullString().
                substr(this.offset(p), this.length(p));
        return new Base64x64(ret).toString();
    }

    isPrimusless () {
        return this.primuses===0;
    }

    isCorrect () {
        const length = this.primuses+this.peers+this.clients+this.sessions;
        return length<=10;
    }

    isAbnormalPart (part, i) {
        const shifted = Base64x64.leftShift(part, this.partOffset(i));
        return shifted[0]==='~';
    }

    toString() {
        return this._formula;
    }

    /** Next value withing a specific replica id part (e.g. next session number)
     * @param {Base64x64|String} id
     * @param {Number} p
     * @return {String} next value, `0` on overflow */
    nextPartValue (id, p) {
        let from=0, i=0;
        while (i<p)
            from += this._parts[i++];
        let till = from + this._parts[i];
        let next = new Base64x64(id).next(till);
        return next.round(from).isZero() ? next.toString() : '0';
    }

}

ReplicaIdScheme.PRIMUS = 0;
ReplicaIdScheme.PEER = 1;
ReplicaIdScheme.CLIENT = 2;
ReplicaIdScheme.SESSION = 3;
ReplicaIdScheme.DB_OPTION_NAME = "DBIdScheme";
ReplicaIdScheme.FORMAT_RE = /^(\d)(\d)(\d)(\d)$/;
ReplicaIdScheme.DEFAULT_SCHEME = '0262';


module.exports = ReplicaIdScheme;