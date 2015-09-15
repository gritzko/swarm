"use strict";
var base64 = require('./base64');
var VV = require('./VV');

// Version vectors are a correct, but expensive way of dealing with partial
// orders. Size of a version vector depends on the number of event sources
// (processes) in a distributed system. Typically, we don't need it, as
// concurrent events tend to be an exception, not a rule.
// Anchored version vectors save space by describing de-facto orders as
// deviations of some linear total order. Most of the time, nothing special
// happens and local orders are in agreement both with the total order and
// each other. Then, an anchored vector only consists of a single "anchor"
// timestamp. Everything behind that timestamp in the linear order is the
// "past" and everything ahead is the "future".
// When some concurrent events indeed happen, an anchored vector employs
// its vector part to describe the deviation (e.g. smaller-timestamp events
// arriving after some greater-timestamp event).
// Once orders return back to agreement, the vector component gets washed
// away, so only the anchor remains.
// Practically, Swarm employs anchored vectors to describe positions in
// de-facto arrival orders relative to another arrival order.
function AnchoredVV (anchor, vector) {
    if (vector) {
        anchor = '' + anchor + vector;
    } else {
        anchor = anchor ? anchor.toString() : '0';
    }
    var m = AnchoredVV.reCheck.exec(anchor);
    if (!m) {
        throw new Error('malformed anchored vector');
    }
    this.anchor = m[1];
    this.vv = new VV(m[2]);
}
module.exports = AnchoredVV;
AnchoredVV.reCheck = new RegExp
    ('^(0|=\\+=)((?:\\!=\\+=)*)$'.replace(/=/g, base64.rT));

AnchoredVV.prototype.toString = function () {
    return this.anchor +( this.vv.vv ? this.vv.toString() : '');
};

AnchoredVV.prototype.setAnchor = function (a) {
    // TODO check
    this.anchor = a;
};

AnchoredVV.prototype.addTip = function (src, ts) {
    this.vv = this.vv.add(src,ts);
};
AnchoredVV.prototype.getTip = function (src) {
    return this.vv.get(src);
};
AnchoredVV.prototype.removeTip = function (src) {
    this.vv = this.vv.remove(src);
};
