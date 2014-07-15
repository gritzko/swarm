'use strict';

var Spec = require('./Spec');

function VersionVector (vec) {
    this.map = {};
    vec && this.add(vec);
}

VersionVector.prototype.add = function (versionVector) {
    var vec=new Spec(versionVector,'!'), tok;
    while (tok=vec.token('!')) {
        var time = tok.bare, source = tok.ext||'swarm';
        if (time > (this.map[source]||''))
            this.map[source] = time;
    }
};

VersionVector.prototype.covers = function (version) {
    Spec.reQTokExt.lastIndex = 0;
    var m = Spec.reTokExt.exec(version);
    var ts = m[1], src = m[2] || 'swarm';
    return ts <= (this.map[src]||'');
};

VersionVector.prototype.maxTs = function () {
    var ts = null,
        map = this.map;
    for (var src in map) {
        if (!ts || ts < map[src]) {
            ts = map[src];
        }
    }
    return ts;
};

VersionVector.prototype.toString = function (trim) {
    trim = trim || {top: 10, rot: '0'};
    var top = trim.top || 10,
        rot = '!' + (trim.rot || '0'),
        ret = [],
        map = this.map;
    for (var src in map) {
        ret.push('!' + map[src] + (src === 'swarm' ? '' : '+' + src));
    }
    ret.sort().reverse();
    while (ret.length > top || ret[ret.length - 1] <= rot) ret.pop();
    return ret.join('') || '!0';
};

module.exports = VersionVector;
