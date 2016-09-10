"use strict";
const swarm = require('swarm-protocol');
const Syncable = require('./Syncable');
const LWWObject = require('./LWWObject');
const ReplicaIdScheme = swarm.ReplicaIdScheme;

/** Database metadata object. */
class Swarm extends LWWObject {

    constructor (value_or_anything, host) {
        super(value_or_anything, host);
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

}



Swarm.id = 'Swarm'; // FIXME rename to CLASS
Syncable._classes[Swarm.id] = Swarm;

module.exports = Swarm;