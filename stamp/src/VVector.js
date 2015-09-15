"use strict";
var LamportTimestamp = require('./LamportTimestamp');

// Version vector represented as a {source: time} map.
function VVector(vec) {
    this.map = {};
    if (vec) {
        this.add(vec);
    }
}

module.exports = VVector;

// simple string serialization of the vector
VVector.prototype.toString = function (delim) {
    var stamps = [];
    var sources = Object.keys(this.map);
    for(var i=0; i<sources.length; i++) {
        var source = sources[i], time = this.map[source];
        stamps.push(source ? time+'+'+source : time);
    }
    stamps.sort().reverse();
    return stamps.join(delim);
};

//
VVector.prototype.add = function (vvec) {
    if (!vvec) { return; }
    if (vvec.constructor!==Array) {
        vvec = LamportTimestamp.parse(vvec.toString());
    }
    for(var i=0; i<vvec.length; i++) {
        var stamp = vvec[i];
        if (!stamp) {continue;}
        if (stamp.constructor!==LamportTimestamp) {
            stamp = new LamportTimestamp(stamp);
        }
        var existing = this.map[stamp.source] || '';
        if (stamp.time > existing) {
            this.map[stamp.source] = stamp.time;
        }
    }
};

VVector.prototype.has = function (source) {
    if (source.indexOf('+')!==-1) {
        source = new LamportTimestamp(source).source;
    }
    return source in this.map;
};

VVector.prototype.covers = function (version) {
    if (version.constructor!==LamportTimestamp) {
        version = new LamportTimestamp(version);
    }
    return version.time <= (this.map[version.source] || '');
};

VVector.prototype.coversAll = function (vv) {
    if (!vv) {return true;}
    if (vv.constructor!==VVector) {
        vv = new VVector(vv);
    }
    for(var source in vv.map) {
        if (!this.map[source] || this.map[source]<vv.map[source]) {
            return false;
        }
    }
    return true;
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
