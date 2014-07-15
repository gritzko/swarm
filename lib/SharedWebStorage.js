'use strict';

var Host                = require('./Host');
var Spec                = require('./Spec');
var stateVersionVector  = require('./stateVersionVector');

// There are two ways to use WebStorage. One is shared storage, where
// all tabs/frames have access to the data. Another is to relay events
// using the HTML5 'storage' event. The latter one should be implemented
// as a Stream not Storage as it needs all the handshakes and stuff.
function SharedWebStorage(usePersistentStorage) {
    this.ls = usePersistentStorage || false;
    this.listeners = {};
    this._id = 'webstorage';
    this.authoritative = false;
    this.tails = {};
    var store = this.store = usePersistentStorage ? localStorage : sessionStorage;

    this.loadTails();

    var self = this;
    // FIXME compat FF, IE
    function onStorageChange (ev) {
        console.warn('@',self._host._id,'storage event',ev.key);
        if (!Spec.is(ev.key) || !ev.newValue) return;
        //if (self.store.getItem(ev.key)!==ev.newValue) return; // FIXME some hint (conflicts with tail cleanup)
        var spec = new Spec(ev.key);
        // states and tails are written as /Type#id.state/tail
        // while ops have full /#!. specifiers.
        if (spec.pattern()!=='/#!.') {
            if (spec.pattern()==='/#') delete self.tails[spec];
            return; // FIXME no-tails, upstream patch => need to actully apply that state
        }
        var ti = spec.filter('/#'), vo=spec.filter('!.');
        if (self.tails[ti] && (vo in self.tails[ti])) return;
        var value = JSON.parse(ev.newValue);
        // send the op back to our listeners
        var ln = self.listeners[ti];
        if (ln) for(var i=0; i<ln.length; i++)
            ln[i].deliver(spec,value,self);
        // FIXME .patch may need special handling
    }
    window.addEventListener('storage', onStorageChange, false);

};

SharedWebStorage.prototype.loadTails = function () {
    // scan/sort specs for existing records
    var store = this.store,
        ti;
    for(var i=0; i<store.length; i++) {
        var key = store.key(i),
            spec = new Spec(key),
            value = store.getItem(key);
        if (spec.pattern() !== '/#!.') continue; // ops only

        ti = spec.filter('/#');
        var tail = this.tails[ti];
        if (!tail) tail = this.tails[ti] = [];
        tail.push(spec.filter('!.'));
    }
    for(ti in this.tails) this.tails[ti].sort();
};

SharedWebStorage.prototype.time = Host.prototype.time;

SharedWebStorage.prototype.deliver = function (spec,value,src) {
    switch (spec.op()) {
    // A storage is always an "uplink" so it never receives reon, reoff.
    case 'on':    return this.on(spec, value, src);
    case 'off':   return this.off(spec, value, src);
    case 'patch': return this.patch(spec, value, src);
    default:      return this.op(spec, value, src);
    }
};

SharedWebStorage.prototype.op = function wsOp (spec, value, src) {
    var ti = spec.filter('/#'),
        vm = spec.filter('!.'),
        tail = this.tails[ti] || (this.tails[ti] = []);
    // The storage piggybacks on the object's state/log handling logic
    // First, it adds an op to the log tail unless the log is too long...
    tail.push(vm);
    this.store.setItem(spec, JSON.stringify(value));
    if (tail.length > 5) {
        src.deliver(spec.set('.on'), '!0.init', this); // request a patch
    }
};

SharedWebStorage.prototype.patch = function wsPatch (spec, state, src) {
    var ti = spec.filter('/#');
    this.store.setItem(ti, JSON.stringify(state));
    var tail = this.tails[ti];
    if (tail) {
        var k;
        while (k = tail.pop()) this.store.removeItem(ti + k);
        delete this.tails[ti];
    }
};

SharedWebStorage.prototype.on = function (spec, base, replica) {
    spec = new Spec(spec);
    var ti = spec.filter('/#');
    var state = this.store.getItem(ti);
    if (state) {
        state = JSON.parse(state);
    } else {
        // an authoritative uplink then may send !0 responses
        if (this.authoritative) {
            state = {_version: '!0'};
            this.store.setItem(ti, JSON.stringify(state));
        }
    }

    var tailKeys = this.tails[ti];
    if (tailKeys) {
        state = state || {};
        var tail = state._tail || (state._tail = {});
        for(var i = 0; i < tailKeys.length; i++) {
            var vm = tailKeys[i];
            tail[vm] = JSON.parse(this.store.getItem(ti + vm));
        }
    }

    replica.deliver(spec.set('.patch'), state || {}, this);

    var vv = state ? stateVersionVector(state) : '!0';

    replica.deliver(ti.add(spec.version(), '!').add('.reon'), vv, this);

    var ln = this.listeners[ti];
    if (!ln) ln = this.listeners[ti] = [];
    ln.push(replica);
};

SharedWebStorage.prototype.off = function (spec,value,src) {
    // FIXME
};

module.exports = SharedWebStorage;
