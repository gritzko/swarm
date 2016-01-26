"use strict";
var LT = require('./LamportTimestamp');

// Version vector represented as a {origin: time} map.
function VVector(vec) {
    this.map = {};
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
    if (stamp.constructor!==LT) {
        stamp = new LT(stamp.toString());
    }
    var existing = this.map[stamp.origin()] || '';
    if (stamp.time()>existing && stamp.time()!=='0') {
        this.map[stamp.origin()] = stamp.time();
    }
    return this;
};

VVector.norm_src = function (origin) {
    if (origin.constructor===String && origin.indexOf('+')!==-1) {
        return new LT(origin).origin();
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


VVector.prototype.addAll = function (new_ts) {
    var stamps = LT.parse(new_ts);
    for(var i=0; i<stamps.length; i++) {
        this.add(stamps[i]);
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
    if (version.constructor!==LT) {
        version = new LT(version);
    }
    return version.time() <= (this.map[version.origin()] || '0');
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
