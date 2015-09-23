"use strict";
var LT = require('./LamportTimestamp');

// Version vector represented as a {source: time} map.
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
    var sources = Object.keys(this.map);
    for(var i=0; i<sources.length; i++) {
        var source = sources[i], time = this.map[source];
        stamps.push(source ? time+'+'+source : time);
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
    var existing = this.map[stamp.source()] || '';
    if (stamp.time()>existing && stamp.time()!=='0') {
        this.map[stamp.source()] = stamp.time();
    }
    return this;
};

VVector.norm_src = function (source) {
    if (source.constructor===String && source.indexOf('+')!==-1) {
        return new LT(source).source();
    } else {
        return source;
    }
};


VVector.prototype.remove = function (source) {
    source = VVector.norm_src(source);
    delete this.map[source];
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

VVector.prototype.get = function (source) {
    source = VVector.norm_src(source);
    var time = this.map[source];
    return time ? time + '+' + source : '0';
};

VVector.prototype.has = function (source) {
    source = VVector.norm_src(source);
    return this.map.hasOwnProperty(source);
};

VVector.prototype.covers = function (version) {
    if (version.constructor!==LT) {
        version = new LT(version);
    }
    return version.time() <= (this.map[version.source()] || '0');
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
