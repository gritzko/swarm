"use strict";

var Syncable = require('./Syncable');

function Storage(async) {
    this.async = !!async || false;
    this.states = {};
    this.tails = {};
    this.counts = {};
    this._host = null;
    // many implementations do not push changes
    // so there are no listeners
    this.lstn = null;
    this._id = 'some_storage';
}
module.exports = Storage;
Storage.prototype.MAX_LOG_SIZE = 10;
Storage.prototype.isRoot = true; // may create global objects

Storage.prototype.deliver = function (spec, value, src) {
    var ret;
    switch (spec.op()) {
        // A storage is always an "uplink" so it never receives reon, reoff.
    case 'on':
        ret = this.on(spec, value, src); break;
    case 'off':
        ret = this.off(spec, value, src); break;
    case 'init':
        if (value._version) { // state
            ret = this.init(spec, value, src);
        } else { // patch
            var ti = spec.filter('/#');
            var specs = [], s;
            for(s in value._tail) {  specs.push(s);  }
            specs.sort();
            while (s=specs.pop()) {
                ret = this.anyOp( ti.add(s), value._tail[s], src);
            }
        }
        break;
    default:
        ret = this.anyOp(spec, value, src);
    }
    return ret;
};

Storage.prototype.on = function storageOn (spec, base, src) {
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
        if (!state) {
            if (self.isRoot) {// && !spec.token('#').ext) {
                // make 0 state for a global object TODO move to Host
                state = {_version: '!0'};
            }
        }
        if (tail) {
            if (!state) {state={};}
            state._tail = state._tail || {};
            for (var s in tail) {
                state._tail[s] = tail[s];
            }
        }
        var tiv = ti.add(spec.version(), '!');
        if (state) {
            src.deliver(tiv.add('.init'), state, self);
            src.deliver(tiv.add('.reon'), Syncable.stateVersionVector(state), self); // TODO and the tail
        } else {
            src.deliver(tiv.add('.reon'), '!0', self); // state unknown
        }
    }

    this.readState(ti, function (err, s) {
        state = s || null;
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

Storage.prototype.init = function (spec, state, src) {
    var ti = spec.filter('/#'), self=this;
    var saveops = this.tails[ti];
    this.writeState(spec, state, function (err) {
        if (err) {
            console.error('state dump error:', err);
        } else {
            var tail = self.tails[ti] || (self.tails[ti] = {});
            for(var op in saveops) { // OK, let's keep that in the log
                tail[op] = saveops[op];
            }
        }
    });
};


Storage.prototype.anyOp = function (spec, value, src) {
    var self = this;
    var ti = spec.filter('/#');
    this.writeOp(spec, value, function (err) {
        if (err) {
            this.close(err); // the log is sacred
        }
    });
    self.counts[ti] = self.counts[ti] || 0;
    if (++self.counts[ti]>self.MAX_LOG_SIZE) {
        // The storage piggybacks on the object's state/log handling logic
        // First, it adds an op to the log tail unless the log is too long...
        // ...otherwise it sends back a subscription effectively requesting
        // the state, on state arrival zeroes the tail.
        delete self.counts[ti];
        src.deliver(spec.set('.reon'), '!0.init', self);
    }
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
    delete this.tails[ti];
    // callback is mandatory
    cb();
};

Storage.prototype.writeOp = function (spec, value, cb) {
    var ti = spec.filter('/#');
    var vm = spec.filter('!.');
    var tail = this.tails[ti] || (this.tails[ti] = {});
    if (tail[vm]) {
        console.error('op replay @storage'+vm+new Error().stack);
    }
    tail[vm] = JSON.stringify(value);
    cb();
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

Storage.prototype.close = function (callback) {
    if (callback) { callback(); }
};

Storage.prototype.emit = function (spec,value) {
    var ti = spec.filter('/#');
    var ln = this.lstn[ti];
    if (!ln) {return;}
    if (ln && ln.constructor===Array) {
        for(var i=0; ln && i<ln.length; i++) {
            var l = ln[i];
            if (l && l.constructor===Function) {
                l(spec,value,this);
            } else if (l && l.deliver) {
                l.deliver(spec,value,this);
            }
        }
    } else if (ln && ln.deliver) {
        ln.deliver(spec,value,this);
    } else if (ln && ln.constructor===Function) {
        ln(spec,value,this);
    }
};
