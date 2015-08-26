'use strict';

var stream_url = require('stream-url');
var lamp64 = require('swarm-stamp');
var Spec =  require('./Spec');
var Op = require('./Op');
var Syncable = require('./Syncable');
var OpStream =  require('./OpStream');
var util         = require("util");
var EventEmitter = require("events").EventEmitter;

// Host is the world of actual Syncable CRDT objects of various types.
// A (full) Swarm node is Host+Storage+Router.
function Host (options) {
    EventEmitter.call(this);
    // id, router, offset_ms
    this.options = options;
    this.ssn_id = null;
    this.db_id = null;
    this.clock = null;
    this.upstream = null;
    this.syncables = {};
    this.inner_states = {};
    if (options.ssn_id) {
        this.ssn_id = options.ssn_id;
        this.clock = new lamp64.Clock(this.ssn_id, options.offset_ms||0);
    }
    if (options.db_id) {
        this.db_id = options.db_id;
    }
    if (options.upstream_url) {
        this.setUpstream(options.upstream_url);
    }
    if (!Host.multihost) {
        if (Host.localhost) {
            throw new Error('not in multihost mode');
        }
        Host.localhost = this;
    }
}
util.inherits(Host, EventEmitter);
module.exports = Host;
Host.debug = false;
Host.multihost = false;
Host.localhost = null;

Host.prototype.close = function () {
    if (Host.localhost===this) {
        Host.localhost = null;
    }
};

Host.prototype.setUpstream = function (url, options) {
    var self = this;
    if (self.upstream) {
        throw new Error('upstream is already set');
    }
    stream_url.connect ( url, options, on_connected );
    function on_connected (err, stream) {
        if (err) {
            console.error(err);
            return;
        }
        var op_stream = new OpStream(stream);
        op_stream.on('id', on_handshake);
        var hs = self.handshake();
        if (hs) {
            op_stream.write(hs);
        }
    }
    function on_handshake (op, op_stream) {
        var upstream_ssn_id = op.origin();
        var upstream_db_id = op.id();
        var hsed = self.ssn_id && self.db_id;
        if (hsed) {
            // Host must listen to it's session router.
            // A Router may listen to other Routers, of course.
            if (upstream_ssn_id!==self.ssn_id || upstream_db_id!==self.db_id) {
                console.error('upstream serves a different db/session');
                op_stream.end();
                return;
            }
        } else {
            self.ssn_id = upstream_ssn_id;
            self.db_id = upstream_db_id;
            self.clock = new lamp64.Clock
                (self.ssn_id, self.options.offset_ms||0);
            op_stream.write(self.handshake());
        }
        self.upstream = op_stream;
        var ids = Object.keys(self.inner_states);
        while (ids.length) {
            var is = self.inner_states[ids.pop()];
            self.opUp(is, 'on', is._version);
        }
        self.emit('ready');
    }
};

Host.prototype.handshake = function () {
    if (!this.ssn_id || !this.db_id) { return null; }
    var key = new Spec('/Swarm+Host').add(this.db_id, '#')
        .add(this.time(),'!').add('.on');
    return new Op(key, '');
};

Host.prototype.time = function () {
    return this.clock ? this.clock.issueTimestamp() : null;
};

// An innner state getter; needs /type#id spec for the object.
Host.prototype.getInnerState = function (obj) {
    if (obj._owner!==this) {
        throw new Error('an alien object');
    }
    return this.inner_states[obj.spec().toString()];
};

// Applies a serialized operation (or a batch thereof) to this replica
Host.prototype.deliver = function (op) {

    var spec = op.spec.filter('/#').toString();
    var syncable = this.syncables[spec];
    if (!syncable) {
        console.warn('syncable not open', ''+spec, ''+op);
        return;
    }
    var events = [], self = this;

    switch (op.op()) {
    // handshake cycle pseudo ops
    case 'on':    break;
    case 'off':   break;
    case 'error':
        // As all the event/operation processing is asynchronous, we
        // cannot simply throw/catch exceptions over the network.
        // This method allows to send errors back asynchronously.
        // Sort of an asynchronous complaint mailbox :)
        console.error('something failed:', ''+op.spec, op.value);
    break;
    case 'diff':
        // Note that events are emitted *after* the complete diff is processed.
        var ops = op.unbundle();  // <<<<< FIXME state
        ops.forEach(function(op) {
            events.push (self.deliverOp(op));
        });
    break;
    default: // actual ops
        var e = this.deliverOp(op);
        e && events.push(e);
    }

    var inner = this.inner_states[op.spec.filter('/#')];
    inner && syncable.rebuild(inner);

    syncable.emit(events);

    // TODO merged ops, like
    //      !time+src.in text
    // should have their *last* stamp in the spec
    // TODO reactions (Syncable? Inner? here?)

    return op.spec;
};

//
Host.prototype.deliverOp = function (op) {

    //Host.debug && console.log('#'+op.id()+
    //    (Host.multihost?'@'+this.id:''),
    //    op.spec.toString(), op.value);

    // sanity checks
    if (op.spec.pattern() !== '/#!.') {
        throw new Error('malformed spec: '+op.spec);
    }

    var events = [];
    var inner = this.inner_states[op.spec.filter('/#')];
    if (!inner) { // our syncable is stateless at the moment
        if (op.op()!=='state') {
            throw new Error('no state received yet; can not apply ops');
        }
        var fn = Syncable.types[op.spec.type()];
        if (!fn) {
            throw new Error('type unknown');
        }
        inner = new fn.Inner(op);
        this.inner_states[op.spec.filter('/#')] = inner;
        events.push({
            name: "init",
            value: op.value,
            target: null,
            old_version: '',
            spec: op.spec
        });
    }
    if (!this.acl(op)) {
        throw new Error('access violation: '+op.spec);
    }

    try {
        var e = inner.deliver(op);
        e && events.push(e);
    } catch (ex) {
        // TODO send back an .error
        return undefined;
    }

    return events;
};

// The method must decide whether the source of the operation has
// the rights to perform it. The method may check both the nearest
// source and the original author of the op.
// If this method ever mentions 'this', that is a really bad sign.
// @returns {boolean}
Host.prototype.acl = function (op) {
    return true;
};

// Inner state lifecycle:
// * unknown (outer: default, '')
// * created fresh: construcor, sent
// * arrived : parse, create, rebuild()
// SCHEME
/**
 * Register a syncable object.
 */

// Incorporate a syncable into this replica.
// In case the object is newly created (like `new Model()`), Host
// assigns an id and saves it. For a known-id objects
// (like `new Model('2THjz01+gritzko~cA4')`) the state is queried
// from the storage/uplink. Till the state is received, the object
// is stateless (`obj.version()===undefined && !obj.hasState()`)
Host.prototype.linkSyncable = function (obj) {
    var id = obj._id;
    if (!id) { // it is a new object; let's add it to the system
        var new_id = this.time();
        obj._id = id = new_id;
        // the default (zero) state is the same for all objects of the type
        // so the version id is the same too: !0
        var ev_spec = obj.spec().add('!0').add('.state');
        // for newly created objects, the 0 state is pushed ahead of the
        // handshake as the uplink certainly has nothing
        var state_op = new Op(ev_spec, '', this.id);

        if (!this.upstream) {
            throw new Error('no upstream - no write ops');
        }
        this.upstream.deliver(state_op);

        // TODO state push @router
        this.inner_states[obj.spec()] = new obj.constructor.Inner(state_op, this);
    }
    var spec = obj.spec().toString();
    if (spec in this.syncables) {
        return this.syncables[spec]; // there is such an object already
    }
    this.syncables[spec] = obj;  // OK, remember it
    obj._owner = this;
    if (new_id) {
        // if the user has supplied any initialization values, those must
        // be applied in the constructors; so it's the time to save it
        obj.save();
    } else {
        // simply init all the fields to defaults
        // inner state is certainly not available at this point
        obj.rebuild(null);
        // we'll repeat rebuild() on state arrival
    }

    if (this.upstream) {
        this.opUp(obj, 'on', obj._version);
    }
    return obj;
};

Host.prototype.opUp = function (obj, op_name, value) {
    var spec = obj.spec().add('H+'+this.ssn_id, '!').add(op_name, '.');
    var op = new Op (spec, value || '');
    this.upstream.write(op);
};

Host.prototype.unlinkSyncable = function (obj) {
    var id = obj._id;
    if (id in this.syncables) {
        if (this.syncables[id]!==obj) {
            throw new Error('the registered object is different');
        }
        delete this.syncables[id];
        this.opUp(obj, 'off');
    }
};

/** new Type()  in multirouter env it may be safer to use router.get() or,
  * at least, new Type(id, router) / new Type(somevalue, router) */
Host.prototype.get = function (spec, callback) {
    if (spec && spec.constructor === Function && spec.prototype._type) {
        spec = '/' + spec.prototype._type;
    }
    spec = new Spec(spec);
    var typeid = spec.filter('/#');
    if (!typeid.has('/')) {
        throw new Error('typeless spec');
    }
    var o = typeid.has('#') && this.syncables[typeid];
    if (!o) {
        var t = Syncable.types[spec.type()];
        if (!t) {
            throw new Error('type unknown: ' + spec);
        }
        return new t(spec.id(), this);
    }
    return o;
};

// author a new operation
Host.prototype.submit = function (syncable, op_name, value) { // TODO sig
    if (syncable._owner!==this) {
        throw new Error('alien op submission');
    }
    var spec = syncable.spec().add(this.time(), '!').add(op_name,'.');
    var op = new Op(spec, value, this.id);
    this.deliver(op);
    if (!this.upstream) {
        throw new Error('no upstream - can not write');
    }
    this.upstream.deliver(op, this);
};


// FIXME  UNIFY CREATION !!!!
Host.prototype.create = function (spec) {
    if (!this.upstream) {
        throw new Error('no upstream connection');
    }
    var type = new Spec(spec, '/').type();
    var type_constructor = Syncable.types[type];
    if (!type_constructor) {
        throw new Error('type unknown: ' + spec);
    }
    var stamp = this.time();
    var state = new Spec(type, '/').add(stamp, '#').add('!0.state');
    var op = new Op(state, '', this.id);
    var inner = new type_constructor.Inner(op);
    this.inner_states[op.spec.filter('/#')] = inner;
    this.upstream.deliver(op, this);
    return new type_constructor(stamp, this);
};
