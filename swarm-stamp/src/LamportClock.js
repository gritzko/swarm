"use strict";
var base64 = require('./base64');
var LamportTimestamp = require('./LamportTimestamp');

/** Pure logical-time Lamport clocks. */
function LamportClock (start_with, options) {
    var start = new LamportTimestamp(start_with);
    options = options || {};
    this.origin = start.origin();
    //this.prefix = options.ClockPrefix || '';
    this.seq = 0; //base64.base2int(start.time());
    this.length = options.ClockLength || 5;
    this.seeStamp(start);
}

LamportClock.prototype.adjustTime = function () {
};

LamportClock.prototype.issueTimestamp = function time () {
    var base = base64.int2base(this.seq++, this.length);
    /*this.prefix +*/
    return new LamportTimestamp(base, this.origin);
};

LamportClock.prototype.parseTimestamp = function parse (stamp) {
    /*if (this.prefix) {
        var p = ts.substr(0, this.prefix.length);
        if (p!==this.prefix) {
            throw new Error('missing prefix');
        }
        ts = ts.substr(this.prefix.length);
    }*/
    var lamp = new LamportTimestamp(stamp.toString()); // ??
    return {
        seq: base64.base2int(lamp.time()),
        origin: lamp.origin()
    };
};


LamportClock.prototype.seeStamp = function see (ts) {
    var parsed = this.parseTimestamp(ts);
    if (parsed.seq>=this.seq) {
        this.seq = parsed.seq + 1;
    }
};
LamportClock.prototype.adjustTime = LamportClock.prototype.seeStamp;


LamportClock.prototype.time2date = function () {
    return undefined;
};

module.exports = LamportClock;
