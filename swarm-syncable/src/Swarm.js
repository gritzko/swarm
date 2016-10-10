"use strict";
const swarm = require('swarm-protocol');
const Syncable = require('./Syncable');
const LWWObject = require('./LWWObject');
const ReplicaIdScheme = swarm.ReplicaIdScheme;

/** Database metadata object. */
class Swarm extends LWWObject {

    constructor (rdt, host) {
        super(rdt, host);
        this._scheme = null;
    }

    filterByPrefix (prefix) {
        let ret = Object.create(null);
        Object.keys(this._values).filter(
            name => name.substr(0,prefix.length)===prefix
        ).forEach(
            key => ret[key] = this._values[key]
        );
        return ret;
    }

    get replicaIdScheme () {
        if (this._scheme===null)
            this._scheme = new ReplicaIdScheme(this.get('DBIdScheme'));
        return this._scheme;
    }

}

class SwarmRDT extends LWWObject.RDT {
    constructor (state, host) {
        super(state, host);
    }
}

Swarm.RDT = SwarmRDT;
SwarmRDT.Class = 'Swarm'; // FIXME rename to CLASS
Syncable.addClass(Swarm);

module.exports = Swarm;