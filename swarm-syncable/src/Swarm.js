"use strict";
const swarm = require('swarm-protocol');
const Syncable = require('./Syncable');
const LWWObject = require('./LWWObject');
const ReplicaIdScheme = swarm.ReplicaIdScheme;

/** Database metadata object. */
class Swarm extends LWWObject {


    filterByPrefix (prefix) {
        let ret = Object.create(null);
        Object.keys(this._values).filter(
            name => name.substr(0,prefix.length)===prefix
        ).forEach(
            key => ret[key] = this._values[key]
        );
        return ret;
    }

}

class SwarmRDT extends LWWObject.RDT {
    constructor (state, host) {
        super(state, host);
    }
}

Swarm.RDT = SwarmRDT;
SwarmRDT.Type = new swarm.Stamp('Swarm'); // FIXME rename to CLASS
Syncable.addClass(Swarm);

module.exports = Swarm;