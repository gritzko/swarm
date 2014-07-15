'use strict';

var Host          = require('./Host');
var Spec          = require('./Spec');
var VersionVector = require('./VersionVector');

function DummyStorage(async) {
    this.async = !!async || false;
    this.states = {};
    this.tails = {};
    this._id = 'dummy';
}

DummyStorage.prototype.time = Host.prototype.time;

DummyStorage.prototype.deliver = function (spec,value,src) {
    switch (spec.op()) {
    // A storage is always an "uplink" so it never receives reon, reoff.
    case 'on':    return this.on(spec, value, src);
    case 'off':   return this.off(spec, value, src);
    case 'patch': return this.patch(spec, value, src);
    default:      return this.op(spec, value, src);
    // A storage is always an "uplink" so it never receives reon, reoff.
    }
};

DummyStorage.prototype.off = function (spec,value,src) {
    // this imlpementation doesn't push changes
    // so there are no listeners
};

DummyStorage.prototype.patch = function (spec,state,src) {
    var ti = spec.filter('/#');
    this.states[ti] = state;
    this.tails[ti] = {};
};

DummyStorage.prototype.op = function (spec,value,src) {
    var ti = spec.filter('/#');
    var tail = this.tails[ti] || (this.tails[ti] = {});
    var count=0;
    for(var s in tail) count++;
    // The storage piggybacks on the object's state/log handling logic
    // First, it adds an op to the log tail unless the log is too long...
    if (count<3 || src._id!==spec.id()) {
        var vm = spec.filter('!.');
        if (vm in tail) console.error('op replay @storage');
        tail[vm] = value;
    } else { // ...otherwise it saves the state, zeroes the tail.
        var state = src.deliver(spec.set('.on'),'.init',this);
    }
    // In a real storage implementation, state and log often go into
    // different backends, e.g. the state is saved to SQL/NoSQL db,
    // while the log may live in a key-value storage.
    // As long as the state has sufficient versioning info saved with
    // it (like a version vector), we may purge the log lazily, once
    // we are sure that the state is reliably saved. So, the log may
    // overlap with the state (some ops are already applied). That
    // provides some necessary resilience to workaround the lack of
    // transactions across backends.
    // In case third parties may write to the state backend, figure
    // some way to deal with it (e.g. make a retrofit operation).
};

DummyStorage.prototype.on = function (spec,base,replica) {
    spec = new Spec(spec);
    var ti = spec.filter('/#'), self=this;

    function reply () {
        var state = self.states[ti];
        var tail = self.tails[ti];
        var idtok = spec.token('#');
        var vertok = spec.token('!');
        if (state || tail) { // if we have something return it
            state = state || {};
            tail = tail || {};
            // don't pass by reference
            state = JSON.parse(JSON.stringify(state));
            state._tail = JSON.parse(JSON.stringify(tail));
        } else if (!idtok.ext) {
            state = self.states[ti] = {_version:'!0'}; // create global obj
        } else {
            state = {}; // I know nothing, sorry
        }
        replica.deliver(spec.set('.patch'),state,self);
        var ihave = new VersionVector(state._version);
        for(var v in tail)
            ihave.add(v);
        replica.deliver( ti.add(spec.version(),'!').add('.reon'),
                        ihave.toString(), self );
    }

    this.async ? setTimeout(reply,1) : reply();
};

module.exports = DummyStorage;
