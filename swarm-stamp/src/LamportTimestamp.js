"use strict";
var base64 = require('./base64');

LamportTimestamp.reTok = new RegExp('^'+base64.rT+'$'); // plain no-extension token
LamportTimestamp.rsTokExt = '(?:(=)\\+)?(=)'.replace(/=/g, base64.rT);
LamportTimestamp.reTokExt = new RegExp('^'+LamportTimestamp.rsTokExt+'$');
LamportTimestamp.reTokExtMG = new RegExp(LamportTimestamp.rsTokExt, 'mg');

/**
 * This class defines the general timestamp format all the *clock* classes
 * must generate: `timestamp+replica`. It is based on the
 * idea of [Logical timestamp][lamport]: time value followed by a process
 * id. Both timestamp and process id are Base64, `+` is a separator.
 * In our case, a "process" is a Swarm db replica. For the syntax of the
 * replica id see {@link LamportTimestamp#replicaTreePath}.
 *
 * The precise meaning of the time part is clock-specific. It may be a pure
 * logical timestamp (incremental) or it may convey the actual wall clock time.
 * The only general requirement is the lexicographic order: a newly issued
 * timestamp must be greater than anything previously seen.
 *
 * Constructor examples: new LT("0time","author"), new LT("0time+author").
 * Note that new LT("author") is understood as "0+author"; empty origin is
 * not valid, unless the time value is 0 (new LT() is "0").
 *
 * [lamport]: http://research.microsoft.com/en-us/um/people/lamport/pubs/time-clocks.pdf
 * @class
 */
function LamportTimestamp (time, origin) {
    if (!origin) {
        if (!time || time==='0') {
            time = '0';
            origin = '';
        } else {
            var m = LamportTimestamp.reTokExt.exec(time);
            if (!m) {
                throw new Error('malformed Lamport timestamp');
            }
            time = m[1] || '0';
            origin = m[2];
        }
    }
    this._time = time || '0';
    this._origin = origin || '';
}

LamportTimestamp.prototype.toString = function () {
    return this._time + (this._origin ? '+' + this._origin : '');
};

LamportTimestamp.is = function (str) {
    LamportTimestamp.reTokExt.lastIndex = 0;
    return LamportTimestamp.reTokExt.test(str);
};

LamportTimestamp.prototype.isZero = function () {
    return this._time === '0';
};

// Is greater than the other stamp, according to the the lexicographic order
LamportTimestamp.prototype.gt = function (stamp) {
    if (stamp.constructor!==LamportTimestamp) {
        stamp = new LamportTimestamp(stamp);
    }
    return this._time > stamp._time ||
        (this._time===stamp._time && this._origin>stamp._origin);
};

LamportTimestamp.prototype.eq = function (stamp) {
    if (stamp.constructor!==LamportTimestamp) {
        stamp = new LamportTimestamp(stamp);
    }
    return this._time===stamp._time && this._origin===stamp._origin;
};

LamportTimestamp.parse = function parseArbitraryString (str) {
    var ret = [], m;
    if (!str) { return ret; }
    LamportTimestamp.reTokExtMG.lastIndex = 0;
    while (m = LamportTimestamp.reTokExtMG.exec(str)) {
        ret.push(new LamportTimestamp(m[1], m[2]));
    }
    return ret;
};

LamportTimestamp.prototype.time = function () {return this._time;};
LamportTimestamp.prototype.origin = function () {return this._origin;};
/**
 *
 */
LamportTimestamp.prototype.author = function () {
    var i = this._origin.indexOf('~');
    return i===-1 ? this._origin : this._origin.substr(0,i);
};

/**
 *  Replicas form a  replica tree. The structure of the tree is reflected
 *  in replica identifiers. Those are tree path-like, using tilde as a
 *  separator. The root node is named `swarm` and is omitted in most cases.
 *  Valid replica name patterns are:
 * 1. `swarm` the root replica
 * 2. `swarm~cluster` server-side replica in a cluster
 * 3. `alice~repl1` client-side replica (shortcut for `swarm~alice~repl1`)
 * 4. `~cluster~bob~repl2` client-side replica synchronized to a
 *    particular cluster (shortcut for `swarm~cluster~bob~repl2`)
 * 5. `carol~repl3~localrepl4` 2nd tier user replica (shortcut for
 *    `swarm~cluster~carol~repl3~localrepl4`)
 *  see doc/protocol.md for a detailed description.
 */
LamportTimestamp.prototype.replicaTreePath = function () {
    return LamportTimestamp.treePath(this._origin);
};

LamportTimestamp.treePath = function (replica_id) {
    var path = replica_id.split('~');
    if (path[0]==='') {
        path[0] = 'swarm';
    } else if (path[0]!=='swarm') {
        path.unshift('swarm');
    }
    return path;
};

LamportTimestamp.prototype.isInSubtree = function (replica_id) {
    var len = replica_id.length;
    if (this._origin===replica_id) {
        return true;
    }
    if (this._origin.length>len &&
        this._origin.substr(0,len)===replica_id &&
        this._origin.charAt(len)==='~') {
        return true;
    }
    var mypath = this.replicaTreePath();
    var path = LamportTimestamp.treePath(replica_id);
    if (mypath.length<=path.length) {
        return false;
    }
    var i=0, minlen = Math.min(mypath.length, path.length);
    while (i<minlen && mypath[i]===path[i]) {
        i++;
    }
    return i===path.length;
};

LamportTimestamp.tuple = function (stamp) {
    return LamportTimestamp.reTokExt.exec(stamp);
};

module.exports = LamportTimestamp;
