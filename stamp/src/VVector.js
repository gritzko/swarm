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
VVector.prototype.add = function (vvec) {
    if (!vvec) { return; }
    if (vvec.constructor!==Array) {
        vvec = LamportTimestamp.parse(vvec.toString());
    }
    for(var i=0; i<vvec.length; i++) {
        var stamp = vvec[i];
        if (!stamp) {continue;}
        if (!stamp.source()) { continue; }
        if (stamp.constructor!==LamportTimestamp) {
            stamp = new LamportTimestamp(stamp);
        }
        var existing = this.map[stamp.source()] || '';
        if (stamp.time() > existing) {
            this.map[stamp.source()] = stamp.time();
        }
    }
    return this;
};

VVector.prototype.remove = function (source) {
    // FIXME!!!
    if (source.indexOf('+')!==-1) {
        source = new LamportTimestamp(source).source();
    }
    delete this.map[source];
    return this;
};

VVector.prototype.isEmpty = function () {
    var keys = Object.keys(this.map);  // FIXME!!!
    return !keys.length || (keys.length===1 && keys[0]==='');
};


VVector.prototype.addAll = function (new_ts) {
    var stamps = LamportTimestamp.parse(new_ts);
    for(var i=0; i<stamps.length; i++) {
        this.add(stamps[i]);
    }
    return this;
};

VVector.prototype.get = function (source) {
    if (source.indexOf('+')!==-1) {
        source = new LamportTimestamp(source).source();
    }
    var time = this.map[source];
    return time ? time + '+' + source : '0';
};

VVector.prototype.has = function (source) {
    if (source.indexOf('+')!==-1) {
        source = new LamportTimestamp(source).source();
    }
    return source in this.map;
};

VVector.prototype.covers = function (version) {
    if (version.constructor!==LamportTimestamp) {
        version = new LamportTimestamp(version);
    }
    return version.time() <= (this.map[version.source()] || '');
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
