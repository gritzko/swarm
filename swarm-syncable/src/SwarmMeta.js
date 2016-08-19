"use strict";
//let swarm = require('swarm-protocol');
let Syncable = require('./Syncable');
let LWWObject = require('./LWWObject');


class SwarmMeta extends LWWObject {

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

}

SwarmMeta.id = 'Swarm';
Syncable._classes[SwarmMeta.id] = SwarmMeta;

module.exports = SwarmMeta;