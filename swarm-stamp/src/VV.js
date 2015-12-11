"use strict";
var base64 = require('./base64');
var LamportTimestamp = require('./LamportTimestamp');
VV.reCheck = new RegExp('^(\\!=\\+=)*$'.replace(/=/g, base64.rT));
VV.reTokG = new RegExp('\\!((=)\\+(=))'.replace(/=/g, base64.rT), 'g');
VV.reBareTok = new RegExp('^(=)\\+(=)$'.replace(/=/g, base64.rT));

// Immutable timestamp vector, String-based implementation.
function VV (string, checked) {
    if (string==='!0') { string = ''; }
    this.vv = string || '';
    if (checked!==1) {
        if (!VV.reCheck.test(this.vv)) {
            throw new Error('malformed timestamp vector');
        }
        this.vv = this.dedup().vv; // parse and normalize the vector
    }
}
module.exports = VV;

VV.prototype.toString = function () {
    return this.vv || '!0';
};

VV.prototype.toArray = function () {
    return this.vv.split('!');
};

VV.prototype.map = function () {
    var map = {}, m;
    while (m = VV.reTokG.exec(this.vv)) {
        var time = m[2], src = m[3];
        var old = map[src];
        if (!old || time>old) {
            map[src] = time;
        }
    }
    return map;
};

VV.prototype.dedup = function () {
    var map = this.map(), toks = [];
    for(var src in map) {
        map.hasOwnProperty(src) && toks.push('!'+map[src]+'+'+src);
    }
    return new VV(toks.sort().reverse().join(''), 1);
};

VV.prototype.sort = function () {
    var sorted = this.toArray().sort().join('!');
    return new VV(sorted, 1);
};

VV.prototype._locate = function (src) {
    if (!base64.reTok.test(src)) {
        throw new Error('malformed src id');
    }
    var i = -1, vv = this.vv;
    while ( -1 !== (i=vv.indexOf(src,i+1)) ) {
        if (vv.charAt(i-1)!=='+') { continue; }
        var next = i+src.length;
        if (next<vv.length && vv.charAt(next)!=='!') { continue; }
        return {
            start:  this.vv.lastIndexOf('!', i),
            source: i,
            end:    i+src.length
        };
    }
    return null;
};

VV.prototype.has = function (src) {
    if (src==='') { return true; }
    return this._locate(src)!==null;
};

VV.prototype.get = function (src) {
    if (src==='') { return '0'; }
    var j = src.indexOf('+');
    if (j!==-1) { src = src.substr(j+1); }
    var l = this._locate(src);
    return l===null ? '' : this.vv.slice(l.start+1, l.end);
};

VV.prototype.set = function (timestamp) {
    var m = VV.reBareTok.exec(timestamp);
    if (!m) {
        throw new Error('malformed timestamp (set)');
    }
    var src = m[2];
    return this.remove(src).add(timestamp);
};

VV.prototype.add = function (new_ts) {
    if (new_ts.toString()==='0') {
        return;
    }
    var m = VV.reBareTok.exec(new_ts.toString()); // FIXME LAMP
    if (!m) {
        throw new Error('malformed timestamp (add)');
    }
    var src = m[2];
    var l = this._locate(src), vv = this.vv;
    if (l===null) {
        return new VV( vv + '!' + new_ts );
    }
    var old_ts = vv.slice(l.start+1, l.end);
    if ( old_ts >= new_ts ) {
        return this;
    } else {
        return new VV( vv.slice(0, l.start+1) + new_ts + vv.slice(l.end), 1 );
    }
};

VV.prototype.addAll = function (new_ts) {
    var merge = new VV(this.vv + new_ts.toString());
    return merge.dedup();
};

VV.prototype.remove = function (src) {
    if (VV.reBareTok.test(src)) {
        src = VV.reBareTok.exec(src)[2];
    }
    var l = this._locate(src), vv = this.vv;
    return l ? new VV(vv.slice(0, l.start) + vv.slice(l.end), 1) : this;
};

VV.prototype.covers = function (ts) {
    if (ts==='0') { return true; }
    return this.get(ts) >= ts;
};

VV.prototype.coversAll = function (vv) {
    var that = new VV(vv).toArray(), self=this;
    return that.some(function(ts){
        return !self.covers(ts);
    });
};

VV.prototype.maxTs = function (vv) {
    return this.toArray().sort().pop();
};

/* single-pass set()
var l = this._locate(src), new_vv, vv = this.vv;
var new_ts = '!' + ts + '+' + src;
if (l===null) {
    new_vv = vv + new_ts;
} else {
    new_vv = vv.substring(0, l.start) +  new_ts + vv.substring(l.end) ;
}
return new VV(new_vv);
*/
