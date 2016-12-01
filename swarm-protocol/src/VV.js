"use strict";
var Stamp = require('./Id');

/** Version vector represented as a {origin: time} map. */
class VV {

    constructor (vec) {
        this.map = new Map();
        this._max = '0';
        if (vec) {
            this.addAll(vec);
        }
    }

    // simple string serialization of the vector
    toString () {
        var stamps = [];
        this.map.forEach((t, o) => stamps.push(Stamp.toString(t, o)));
        stamps.sort().reverse();
        stamps.unshift(stamps.length?'':'@0');
        return stamps.join('@');
    }

    //
    add (stamp) {
        if (!stamp) {return;}
        if (stamp.constructor!==Stamp) {
            stamp = new Stamp(stamp.toString());
        }
        this.addPair(stamp.value, stamp.origin);
        return this;
    }

    addPair (value, origin) {
        var existing = this.map.get(origin) || '0';
        if (value>existing && value!=='0') {
            this.map.set(origin, value);
        }
        if (value > this._max)
            this._max = value;
    }


    delete (origin) {
        this.remove(origin);
    }

    isEmpty () {
        return this.map.size===0;
    }


    addAll (new_ts) {
        VV.reVVTok.lastIndex = 0;
        var m = null;
        while (m=VV.reVVTok.exec(new_ts)) {
            this.addPair (m[1], m[2]);
        }
        return this;
    }

    get (origin) {
        origin = VV.norm_src(origin);
        var time = this.map.get(origin);
        return time ? time + '-' + origin : '0';
    }

    has (origin) {
        origin = VV.norm_src(origin);
        return this.map.has(origin);
    }

    covers (version) {
        if (version.constructor!==Stamp) {
            version = new Stamp(version);
        }
        return version.value <= (this.map.get(version.origin) || '0');
    }

    coversAll (vv) {
        if (!vv) {return true;}
        if (vv.constructor!==VV) {
            vv = new VV(vv);
        }
        for(var origin of vv.map.keys()) {
            if ( vv.get(origin) > this.get(origin) )
                return false;
        }
        return true;
    }

    get max () {
        return this._max;
    }

    static norm_src (origin) {
        if (origin.constructor===String && origin.indexOf('-')!==-1) {
            return new Stamp(origin).origin;
        } else {
            return origin;
        }
    }

}

VV.rsVVTok = '@'+Stamp.rsTokExt;
VV.reVVTok = new RegExp(VV.rsVVTok, 'g');

module.exports = VV;
