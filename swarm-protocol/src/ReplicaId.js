"use strict";
const Base64x64 = require('./Base64x64');
const Scheme = require('./ReplicaIdScheme');

/** Replica id, immutable.
 *  https://gritzko.gitbooks.io/swarm-the-protocol/content/replica.html */
class ReplicaId {

    // FIXME as, is, all the immutable conventions PLEASE!!!
    // 2. fromString
    // 3. is
    // 4. as (str)
    // 5. forkPeer, forkClient, forkSession

    /**  */
    constructor(primus, peer, client, ssn, scheme) {
        this._scheme = scheme ? Scheme.as(scheme) : ReplicaId.SCHEME;
        this._id = this._scheme.join([primus, peer, client, ssn]);
        const parts = this._scheme.split(this._id);
        this._primus = parts[0];
        this._peer = parts[1];
        this._client = parts[2];
        this._ssn = parts[3];
    }

    static fromString (id, scheme) {
        const sch = scheme ? Scheme.as(scheme) : ReplicaId.SCHEME;
        if (!ReplicaId.is(id))
            throw new Error('not a replica id');
        const parts = sch.split(id);
        return new ReplicaId(parts[0], parts[1], parts[2], parts[3], sch);
    }

    static as(rid) {
        if (rid.constructor===ReplicaId) return rid;
        return ReplicaId.fromString(rid);
    }

    static is (rid) {
        return Base64x64.is(rid) &&
            !Base64x64.isAbnormal(rid) &&
                !Base64x64.isZero(rid);
    }

    get primus () {return this._primus;}
    get peer () {return this._peer;}
    get client () {return this._client;}
    get session () {return this._ssn;}
    get scheme () {return this._scheme;}

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

    eq (rid) {
        return this.toString()===rid.toString();
    }

    toString () {
        return this._id;
    }

    forkPeer (peer_id) {
        return new ReplicaId(this.primus, peer_id, '0', '0', this.scheme);
    }

    forkClient (client_id) {
        return new ReplicaId(this.primus, this.peer, client_id, '0', this.scheme);
    }

    forkSession (ssn_id) {
        return new ReplicaId(this.primus, this.peer, this.client, ssn_id, this.scheme);
    }

}

/** Assumption: even if you open multiple databases, they still belong
    to the same pool, so the replica id scheme is the same.
    If you open dbs from multiple pools, you must know what you are doing. */
ReplicaId.DEFAULT_SCHEME = new Scheme();
ReplicaId.SCHEME = ReplicaId.DEFAULT_SCHEME;

module.exports = ReplicaId;
