"use strict";
var Swarm = require('swarm-syncable');
var AnchoredVV = Swarm.AnchoredVV;
var VVector = Swarm.VVector;
var Op = Swarm.Op;
var Spec = Swarm.Spec;
var Lamp = Swarm.LamportTimestamp;

/**
 *  Meta-state of a syncable object's op log.
 *  Reflects base state snapshot, state of the sync with the upstream,
 *  last record made.
 *  @class
 */
function LogMeta (string) {
    this.subscribers = [];
    // The last stamp received from the upstream (remote order).
    this.last = null;
    // Everything up to this stamp is known to the upstream (local order).
    this.anchor = null;
    // The stack-stamp of the recentmost record.
    this.tip = null;
    // Version vector for ops acknowledged by the upstream.
    this.vv = null; // as VV
    // The base state.
    this.base = null;
    var m;
    if (string) {
        while (m=LogMeta.reKeyVal.exec(string)) {
            switch (m[1]) {
            case 'l': this.last = m[2]; break;
            case 'b': this.base = m[2]; break;
            case 'a': this.anchor = m[2]; break;
            case 'v': this.vv = new VVector(m[2]); break;
            case 't': this.tip = m[2]; break;
            }
        }
    }
    // Everything defaults to a single snapshot being received from
    // the upstream and never updated.
    if (this.tip === null) {
        this.tip = this.base;
    }
    if (this.anchor === null) {
        this.anchor = this.base;
    }
    if (this.last === null) {
        this.last = this.base;
    }
    if (this.vv === null) {
        this.vv = new VVector();
    }
}
LogMeta.reKeyVal = /(\w):(\S+)/g;
module.exports = LogMeta;


/**
 *  Serialize the meta state; the result is consumed by the
 *  constructor.
 */
LogMeta.prototype.toString = function () {
    var str = 'b:' + (this.base||'0');
    if (this.last && this.last!==this.base) {
        str = 'l:' + this.last;
    }
    if (this.anchor && this.anchor!==this.base) {
        str += ' a:' + this.anchor;
    }
    if (this.tip && this.tip!==this.base) {
        str += ' t:' + this.tip;
    }
    if (this.vv && !this.vv.isEmpty()) {
        str += ' v:' + this.vv.toString();
    }
    return str;
};
