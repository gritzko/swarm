"use strict";
const Id = require('./Id');
const Ids = require('./Ids');

/** id-to-stamp map */
class VersionMap {

    constructor (ids, stamps) {
        this._map = Object.create(null);
        const i = Ids.as(ids).iterator();
        const s = Ids.as(stamps).iterator();
        while (!i.end && !s.end) {
            this._map[i.nextId()] = s.nextId().toString();
        }
    }

    set (id, stamp) {
        this._map[Id.as(id).toString()] = stamp.toString();
    }

    get (id) {
        const got = this._map[Id.as(id).toString()];
        return Id.as(got||'0');
    }

    toString () {
        const ids = Object.keys(this._map);
        const stamps = ids.map( k => this._map[k] );
        const i = Ids.fromIdArray(ids, '#');
        const s = Ids.fromIdArray(stamps, '@');
        return i.toString() + s.toString();
        // TODO sort by origin/value
    }

    static fromString (string) {
        const i = string.indexOf('@');
        const ids = string.substr(0, i);
        const stamps = string.substr(i);
        return new VersionMap(ids, stamps);
    }

}

module.exports = VersionMap;