"use strict";
var Stamp = require('./Stamp');

// Version vector represented as a {origin: time} map.
function VVector(vec) {
    this.map = new Map();
    if (vec) {
        this.addAll(vec);
    }
}

module.exports = VVector;

// simple string serialization of the vector
VVector.prototype.toString = function () {
    var stamps = [];
    var origins = Object.keys(this.map);
    for(var i=0; i<origins.length; i++) {
        var origin = origins[i], time = this.map[origin];
        stamps.push(origin ? time+'+'+origin : time);
    }
    stamps.sort().reverse();
    stamps.unshift(stamps.length?'':'!0');
    return stamps.join('!');
};

//
VVector.prototype.add = function (stamp) {
    if (!stamp) {return;}
    if (stamp.constructor!==Stamp) {
        stamp = new Stamp(stamp.toString());
    }
    this.addPair(stamp.value, stamp.origin);
    return this;
};

VVector.prototype.addPair = function (value, origin) {
    var existing = this.map[origin] || '';
    if (value>existing && value!=='0') {
        this.map[origin] = value;
    }
};

VVector.norm_src = function (origin) {
    if (origin.constructor===String && origin.indexOf('+')!==-1) {
        return new Stamp(origin).origin;
    } else {
        return origin;
    }
};


VVector.prototype.remove = function (origin) {
    origin = VVector.norm_src(origin);
    delete this.map[origin];
    return this;
};

VVector.prototype.isEmpty = function () {
    var keys = Object.keys(this.map);
    return !keys.length;
};


VVector.rsVVTok = '!'+Stamp.rsTokExt;
VVector.reVVTok = new RegExp(VVector.rsVVTok, 'g');

VVector.prototype.addAll = function (new_ts) {
    VVector.reVVTok.lastIndex = 0;
    var m = null;
    while (m=VVector.reVVTok.exec(new_ts)) {
        this.addPair (m[1], m[2]);
    }
    return this;
};

VVector.prototype.get = function (origin) {
    origin = VVector.norm_src(origin);
    var time = this.map[origin];
    return time ? time + '+' + origin : '0';
};

VVector.prototype.has = function (origin) {
    origin = VVector.norm_src(origin);
    return this.map.hasOwnProperty(origin);
};

VVector.prototype.covers = function (version) {
    if (version.constructor!==Stamp) {
        version = new Stamp(version);
    }
    return version.value <= (this.map[version.origin] || '0');
};

VVector.prototype.coversAll = function (vv) {
    if (!vv) {return true;}
    if (vv.constructor!==VVector) {
        vv = new VVector(vv);
    }
    var keys = Object.keys(vv.map), map=this.map;
    return keys.every(function(key){
        return map.hasOwnProperty(key) && map[key] > vv.map[key];
    });
};

VVector.prototype.maxTs = function () {
    var ts = null,
        map = this.map;
    for (var src in map) {
        if (!ts || ts < map[src]) {
            ts = map[src];
        }
    }
    return ts;
};
