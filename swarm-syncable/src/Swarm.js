"use strict";
let swarm = require('swarm-protocol');
let Syncable = require('./Syncable');
let LWWObject = require('./LWWObject');

/** Database metadata object. */
class Swarm extends LWWObject {

    constructor (value_or_anything, host) {
        super(value_or_anything, host);
    }

    filterByPrefix (prefix) {
        let ret = Object.create(null);
        let keys = Object.keys(this._values).filter(
            name => name.substr(0,prefix.length)===prefix
        );
        keys.forEach( key => ret[key] = this._values[key] );
        return ret;
    }

    static parseReplicaIdScheme (id_scheme) {
        let m = id_scheme.match(/\d/mg);
        if (!m || m.length!==4)
            return null;
        let lengths = m.map( c => parseInt(c) );
        let ten = lengths[0] + lengths[1] + lengths[2] + lengths[3];
        if (ten===10)
            return new Swarm.ReplicaIdScheme(lengths);
        else
            return null;
    }

}

Swarm.ReplicaIdScheme = class {

    constructor (lengths) {
        this.lengths = lengths;
        this.primuses = lengths[0];
        this.peers = lengths[1];
        this.clients = lengths[2];
        this.sessions = lengths[3];
    }

    parseReplicaId (id) {
        if (!swarm.Base64x64.is(id)) return null;
        let chunks = [];
        for(let i=0, off=0; i<4; i++, off+=this.lengths[i])
            chunks[i] = id.substr(off, off+this.lengths[i]);
        return {
            primus: chunks[0] || '',
            peer:   chunks[1] || '',
            client: chunks[2] || '',
            session:chunks[3] || ''
        };
    }

    toString() {
        return this.lengths.join('');
    }

};

Swarm.id = 'Swarm';
Syncable._classes[Swarm.id] = Swarm;
Swarm.DEFAULT_REPLICA_ID_SCHEME = Swarm.parseReplicaIdScheme('0262');

module.exports = Swarm;