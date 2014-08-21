"use strict";

var Syncable = require('./Syncable');
var Host = require('./Host'); // FIXME time

function Storage(async) {
    this.async = !!async || false;
    this.states = {};
    this.tails = {};
    // many implementations do not push changes
    // so there are no listeners
    this.lstn = null;
    this._id = 'dummy';
}
module.exports = Storage;
Storage.prototype.time = Host.prototype.time;

Storage.prototype.deliver = function (spec, value, src) {
    switch (spec.op()) {
        // A storage is always an "uplink" so it never receives reon, reoff.
    case 'on':
        return this.on(spec, value, src);
    case 'off':
        return this.off(spec, value, src);
    case 'patch':
        return this.patch(spec, value, src);
    default:
        return this.anyOp(spec, value, src);
    }
};

Storage.prototype.on = function (spec, base, src) {
    var ti = spec.filter('/#');

    if (this.lstn) {
        var ls = this.lstn[ti];
        if (ls === undefined) {
            ls = src;
        } else if (ls !== src) {
            if (ls.constructor !== Array) {
                ls = [ls];
            }
            ls.push(src);
        }
        this.lstn[ti] = ls;
    }

    var self = this;
    var state;
    var tail;

    function sendResponse() {
        if (tail) {
            state._tail = state._tail || {};
            for (var s in tail) {
                state._tail[s] = tail[s];
            }
        }
        var tiv = ti.add(spec.version(), '!');
        src.deliver(tiv.add('.patch'), state, self);
        src.deliver(tiv.add('.reon'), Syncable.stateVersionVector(state), self);
    }

    this.readState(ti, function (err, s) {
        state = s || {_version: '!0'};
        if (tail !== undefined) {
            sendResponse();
        }
    });

    this.readOps(ti, function (err, t) {
        tail = t || null;
        if (state !== undefined) {
            sendResponse();
        }
    });
};


Storage.prototype.off = function (spec, value, src) {
    if (!this.lstn) {
        return;
    }
    var ti = spec.filter('/#');
    var ls = this.lstn[ti];
    if (ls === src) {
        delete this.lstn[ti];
    } else if (ls && ls.constructor === Array) {
        var cleared = ls.filter(function (v) {return v !== src;});
        if (cleared.length) {
            this.lstn[ti] = cleared;
        } else {
            delete this.lstn[ti];
        }
    }
};

Storage.prototype.patch = function (spec, state, src) {
    this.writeState(spec, state, function (err) {
        if (err) {
            console.error('state write error:', err);
        } // else { // FIXME self.trimTail(spec); }
    });
};


Storage.prototype.anyOp = function (spec, value, src) {
    var self = this;
    this.writeOp(spec, value, function (err) {
        if (err === false) {
            // The storage piggybacks on the object's state/log handling logic
            // First, it adds an op to the log tail unless the log is too long...
            // ...otherwise it sends back a subscription effectively requesting
            // the state, on state arrival zeroes the tail.
            src.deliver(spec.set('.reon'), '.init', self);
        } else if (err !== true) {
            console.error('op write error:', err);
        }
    });
};


// In a real storage implementation, state and log often go into
// different backends, e.g. the state is saved to SQL/NoSQL db,
// while the log may live in a key-value storage.
// As long as the state has sufficient versioning info saved with
// it (like a version vector), we may purge the log lazily, once
// we are sure that the state is reliably saved. So, the log may
// overlap with the state (some ops are already applied). That
// provides some necessary resilience to workaround the lack of
// transactions across backends.
// In case third parties may write to the backend, go figure
// some way to deal with it (e.g. make a retrofit operation).
Storage.prototype.writeState = function (spec, state, cb) {
    var ti = spec.filter('/#');
    this.states[ti] = JSON.stringify(state);
    // tail is zeroed on state flush
    this.tails[ti] = {};
    // callback is mandatory
    cb();
};

Storage.prototype.writeOp = function (spec, value, cb) {
    var ti = spec.filter('/#');
    var vm = spec.filter('!.');
    var tail = this.tails[ti] || (this.tails[ti] = {});
    if (vm in tail) {
        console.error('op replay @storage');
    }
    tail[vm] = JSON.stringify(value);
    var count = 0;
    for (var s in tail) { count++; } // jshint ignore: line
    cb(count < 3);
};

Storage.prototype.readState = function (ti, callback) {
    var state = JSON.parse(this.states[ti] || null);

    function sendResponse() {
        callback(null, state);
    }

    // may force async behavior
    this.async ? setTimeout(sendResponse, 1) : sendResponse();
};

Storage.prototype.readOps = function (ti, callback) {
    var tail = JSON.parse(this.tails[ti] || null);
    callback(null, tail);
};
