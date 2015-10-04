"use strict";
var Spec = require('./Spec');
var Storage = require('./Storage');


/** SharedWebStorage may use localStorage or sessionStorage
 *  to cache data. The role of ShWS is dual: it may also
 *  bridge ops from one browser tab/window to another using
 *  HTML5 onstorage events. */
function SharedWebStorage(id, options) {
    this.options = options || {};
    this.lstn = {};
    this._id = id;
    this.tails = {};
    this.store = this.options.persistent ?
        window.localStorage : window.sessionStorage;

    this.loadLog();
    this.installListeners();
}

SharedWebStorage.prototype = new Storage();
SharedWebStorage.prototype.isRoot = false;
module.exports = SharedWebStorage;


SharedWebStorage.prototype.onOp = function (spec, value) {
    var ti = spec.filter('/#');
    var vo = spec.filter('!.');
    if (!vo.toString()) {
        return; // state, not an op
    }
    var tail = this.tails[ti];
    if (!tail) {
        tail = this.tails[ti] = [];
    } else if (tail.indexOf(vo)!==-1) {
        return; // replay
    }
    tail.push(vo);
    this.emit(spec,value);
};


SharedWebStorage.prototype.installListeners = function () {
    var self = this;
    function onStorageChange(ev) {
        if (Spec.is(ev.key) && ev.newValue) {
            self.onOp(new Spec(ev.key), JSON.parse(ev.newValue));
        }
    }
    window.addEventListener('storage', onStorageChange, false);
};


SharedWebStorage.prototype.loadLog = function () {
    // scan/sort specs for existing records
    var store = this.store;
    var ti;
    for (var i = 0; i < store.length; i++) {
        var key = store.key(i);
        if (!Spec.is(key)) { continue; }
        var spec = new Spec(key);
        if (spec.pattern() !== '/#!.') {
            continue; // ops only
        }
        ti = spec.filter('/#');
        var tail = this.tails[ti];
        if (!tail) {
            tail = this.tails[ti] = [];
        }
        tail.push(spec.filter('!.'));
    }
    for (ti in this.tails) {
        this.tails[ti].sort();
    }
};


SharedWebStorage.prototype.writeOp = function wsOp(spec, value, src) {
    var ti = spec.filter('/#');
    var vm = spec.filter('!.');
    var tail = this.tails[ti] || (this.tails[ti] = []);
    tail.push(vm);
    var json = JSON.stringify(value);
    this.store.setItem(spec, json);
    if (this.options.trigger) {
        var otherStore = !this.options.persistent ?
            window.localStorage : window.sessionStorage;
        if (!otherStore.getItem(spec)) {
            otherStore.setItem(spec,json);
            otherStore.removeItem(spec,json);
        }
    }
};


SharedWebStorage.prototype.writeState = function wsPatch(spec, state, src) {
    var ti = spec.filter('/#');
    this.store.setItem(ti, JSON.stringify(state));
    var tail = this.tails[ti];
    if (tail) {
        for(var k=0; k<tail.length; k++) {
            this.store.removeItem(ti + tail[k]);
        }
        delete this.tails[ti];
    }
};

SharedWebStorage.prototype.readState = function (spec, callback) {
    spec = new Spec(spec);
    var ti = spec.filter('/#');
    var state = this.store.getItem(ti);
    callback(null, (state&&JSON.parse(state)) || null);
};

SharedWebStorage.prototype.readOps = function (ti, callback) {
    var tail = this.tails[ti];
    var parsed = null;
    for(var k=0; tail && k<tail.length; k++) {
        var spec = tail[k];
        var value = this.store.getItem(ti+spec);
        if (!value) {continue;} // it happens
        parsed = parsed || {};
        parsed[spec] = JSON.parse(value);
    }
    callback(null, parsed);
};
