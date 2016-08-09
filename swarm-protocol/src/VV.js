"use strict";
var Stamp = require('./Stamp');

/** Version vector represented as a {origin: time} map. */
class VV {

    constructor (vec) {
        this.map = new Map();
        if (vec) {
            this.addAll(vec);
        }
    }
    
    // simple string serialization of the vector
    toString () {
        var stamps = [];
        var origins = Object.keys(this.map);
        for(var i=0; i<origins.length; i++) {
            var origin = origins[i], time = this.map[origin];
            stamps.push(origin ? time+'+'+origin : time);
        }
        stamps.sort().reverse();
        stamps.unshift(stamps.length?'':'!0');
        return stamps.join('!');
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
        var existing = this.map[origin] || '';
        if (value>existing && value!=='0') {
            this.map[origin] = value;
        }
    }

    remove (origin) {
        origin = VV.norm_src(origin);
        delete this.map[origin];
        return this;
    }

    isEmpty () {
        var keys = Object.keys(this.map);
        return !keys.length;
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
        var time = this.map[origin];
        return time ? time + '+' + origin : '0';
    }

    has (origin) {
        origin = VV.norm_src(origin);
        return this.map.hasOwnProperty(origin);
    }

    covers (version) {
        if (version.constructor!==Stamp) {
            version = new Stamp(version);
        }
        return version.value <= (this.map[version.origin] || '0');
    }

    coversAll (vv) {
        if (!vv) {return true;}
        if (vv.constructor!==VV) {
            vv = new VV(vv);
        }
        var keys = Object.keys(vv.map), map=this.map;
        return keys.every(function(key){
            return map.hasOwnProperty(key) && map[key] > vv.map[key];
        });
    }

    maxTs () {
        var ts = null,
            map = this.map;
        for (var src in map) {
            if (!ts || ts < map[src]) {
                ts = map[src];
            }
        }
        return ts;
    }

    static norm_src (origin) {
        if (origin.constructor===String && origin.indexOf('+')!==-1) {
            return new Stamp(origin).origin;
        } else {
            return origin;
        }
    }

}

VV.rsVVTok = '!'+Stamp.rsTokExt;
VV.reVVTok = new RegExp(VV.rsVVTok, 'g');

module.exports = VV;
