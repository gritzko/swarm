"use strict";

var Spec = require('./Spec');
var Op = require('./Op');
var env = require('./env');


/**
 * All CRDT model classes must extend syncable directly or indirectly. Syncable
 * provides all the necessary oplog- and state-related primitives and methods.
 * Every state-mutating method should be explicitly declared to be wrapped
 * by extend() (see 'ops', 'neutrals', 'remotes' sections in class declaration).
 * @param {function|string} fn
 * @param {{ops:object, neutrals:object, remotes:object}} own
 */
/**
 * Syncable: an oplog-synchronized object
 * Syncable(spec|id|state[,host])
 * @constructor
 */
 // please call Syncable.constructor.apply(this,args) in your constructor
function Syncable(id_or_null, owner) {
    // The most correct way to specify a version is the version vector,
    // but that one may consume more space than the data itself in some cases.
    // Hence, _version is not a fully specified version vector (see version()
    // instead). _version is essentially is the greatest operation timestamp
    // (Lamport-like, i.e. "time+source"), sometimes amended with additional
    // timestamps. Its main features:
    // (1) changes once the object's state changes
    // (2) does it monotonically (in the alphanum order sense)

    this._id = null;
    this._owner = null;
    this._version = '';
    this._listeners = null;

    //if (env.multihost) {
        if (arguments[1]) { // TODO prototype._owner
            if (owner.constructor.name==='Host') {
                owner = owner.logics;
            }
            if (!owner.syncables) {
                throw new Error('invalid owner');
            }
        } else {
            owner = env.localhost.logics;
            console.warn('no host specified in multihost mode');
        }
    //} TODO no this.owner for non-multihosts, this.getOwner()


    if (id_or_null) { // set the id
        this._id = id_or_null;
    }

    // obtain the id, possibly issue zero state,
    // certainly issue a subscription
    var doubl = owner.linkSyncable(this);
    return doubl;

}

module.exports = Syncable;

Syncable.prototype.getInnerState = function () {
    return this._owner.getInnerState(this);
};

Syncable.prototype.save = function () {
};

Syncable.prototype.apply = function () {
};

Syncable.prototype.host = function () {
    return env.multihost ? this._host : env.localhost;
};


Syncable.types = {};

Syncable.registerType = function (name, type) {
    if (!type || type.constructor!==Function) {
        throw new Error("please provide a constructor");
    }
    if (!type.Inner || type.Inner.constructor!==Function) {
        throw new Error("please provide an inner state constructor");
    }
    if (!name || name.constructor!==String || !/[A-Z]\w+/.test(name)) {
        throw new Error('invalid class name');
    }
    Syncable.types[name] = type;
    type.prototype._type = name; // TODO multiple-reg
};

Syncable.reMethodName = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;



// add reactions  TODO .4 compact

/**
 * A *reaction* is a hybrid of a listener and a method. It "reacts" on a
 * certain event for all objects of that type. The callback gets invoked
 * as a method, i.e. this===syncableObj. In an event-oriented architecture
 * reactions are rather handy, e.g. for creating mixins.
 * @param {string} op operation name
 * @param {function} fn callback
 * @returns {{op:string, fn:function}}
 */
Syncable.addReaction = function (op, fn) {
    var reactions = this.prototype._reactions;
    var list = reactions[op];
    list || (list = reactions[op] = []);
    list.push(fn);
    return {op: op, fn: fn};
};

/**
 *
 * @param handle
 */
Syncable.removeReaction = function (handle) {
    var op = handle.op,
        fn = handle.fn,
        list = this.prototype._reactions[op],
        i = list.indexOf(fn);
    if (i === -1) {
        throw new Error('reaction unknown');
    }
    list[i] = undefined; // such a peculiar pattern not to mess up out-of-callback removal
    while (list.length && !list[list.length - 1]) {
        list.pop();
    }
};


// Syncable includes all the oplog, change propagation and distributed
// garbage collection logix.

Syncable.prototype.spec = function () {
    return new Spec('/' + this._type + '#' + this._id);
};

// Generates a new specifier with an unique timestamp
Syncable.prototype.newEventSpec = function (op) {
    return this.spec().add(this._owner.time(), '!').add(op, '.');
};

// Returns current object state specifier
Syncable.prototype.stateSpec = function () {
    return this.spec() + (this._version || '!0');
};


/** Syncable object version transitions:
 *
 *             ''                    state unknown
 *              ↓
 *             !0                    default/initial state
 *              ↓
 *   ↻ !time1+src1!time2+src2        version vector
 *              ↓
 *             !~                    deleted
 *
 * @returns {Spec.Map} the version vector for this object
 */
Syncable.prototype.version = function () {
    return Spec.Map(this._version);
};



// External objects (those you create by supplying an id) need first to query
// the uplink for their state. Before the state arrives they are stateless.
Syncable.prototype.hasState = function () {
    return !!this._version;
};

Syncable.prototype.rebuild = function (inner) {
    inner = inner || this.getInnerState();
    this._id = inner ? inner._id : this._id;
    this._version = inner ? inner._version : '';
};

// Deallocate everything, free all resources.
Syncable.prototype.close = function () {
    this.host().unregisterSyncable(this);
};

// Once an object is not listened by anyone it is perfectly safe
// to garbage collect it.
Syncable.prototype.gc = function () {
    if (!this._listeners) {
        this.close();
    }
};

Syncable.prototype.on = function (filter, callback, context) {
    if ( filter && filter.constructor===Function &&
         (!callback || callback.constructor!==Function) ) {
        context = callback;
        callback = filter;
        filter = null;
    }
    if (!this._listeners) {
        this._listeners = [];
    }
    this._listeners.push({
        callback: callback,
        filter: filter||null,
        context: context||null
    });
};

Syncable.prototype.off = function(filter,callback,context) {
    if (!this._listeners) {return;}
    if (filter.constructor===Function) {
        context = callback;
        callback = filter;
        filter = null;
    }
    filter = filter || null;
    context = context || null;
    this._listeners = this._listeners.filter (
        function (l) {
            return  l.callback!==callback;
        }
    );
    if (this._listeners.length===0) {
        this._listeners = null;
    }
};

Syncable.prototype.emit = function (events) {
    if (!this._listeners) { return; }
    // FIXME
    if (events.constructor!==Array) { events= [events]; }
    while (events.length) {
        var event = events.pop();
        if (!event) {
            continue;
        } else if (event.constructor===Array) {
            this.emit(event);
            continue;
        }
        event.target = this;
        this._listeners.forEach(function(l){
            if (l.filter) {
                var ftype = l.filter.constructor;
                if (ftype===String && l.filter!==event.name) {
                    return;
                } else if (ftype===Function && !l.filter(event)) {
                    return;
                }
            }
            try {
                l.callback.call(l.context,event);
            } catch (ex) {
                console.error("listener failed", ex.message, ex.stack);
            }
        });
    }
};

Syncable.prototype.once = function (filter, callback, context) {
    var self = this;
    self.on(filter, function wrapper (ev) {
        callback.call(this,ev);
        self.off(filter,wrapper,context);
    }, context);
};

Syncable.prototype.onInit = function (callback, context) {
    if (this._version) {
        callback.call(context||this, null);
    } else {
        this.once('init', callback, context);
    }
};

Syncable.prototype.onLoad = function (callback, context) {
    // FIXME .4 wait all Refs to load
    // FIXME no refs => same as .init
    this.once('load', callback, context);
};


// entirely passive, has no link to the logics/host
function Inner (op) {
    this._id = op.id();
    this._version = op.version().toString();
}
Syncable.Inner = Inner;
Syncable.registerType('Syncable', Syncable);


Inner.prototype.deliver = function (op) {
    var stamp = op.stamp();
    var vv = new Spec.Map(this._version);
    if (vv.covers(stamp)) {// this op was applied in the past
        console.warn();
        return;
    }
    // nuance: if the op code throws an exception, it still
    //  counts as applied to avoid permanent op feed "jam"
    vv.add(stamp);
    this._version = vv.toString();
    return this.dispatch(op);
};

Inner.prototype.dispatch = function (op) {
    throw new Error("syncable has no ops but .state");
};

// FIXME obsolete
/** Syncable CmRDT objects use state machine replication. The only
 * difference from the classic case is that operations are not linear
 * but partially ordered (http://bit.ly/1Nl3ink, http://bit.ly/1F07aZ0)
 * Thus, a state of a Syncable object is transferred to a replica using
 * some combination of state snapshots (POJO) and operation logs.
 * The .init pseuso-operation ferries those from replica to replica.
 * init may carry a state snapshot or an oplog tail or both or none.
 * The format of the init value object is POJO JSON state and
 * special fields: _tail, _version (the latter flags presence of a POJO
 * state).
 * .init is normally produced in the handshake phase, as a response to
 * .on or .reon. Later on, any real-time changes are transferred as
 * individual operations.
 * Init is considered a neutral pseudo-op, albeit it may emit the "init"
 * event if it actually initializes the state.
 * It might have been possible to split .init into a "true" op .state
 * and separate operations of the tail, but we need some atomicity here.
 * @this {Syncable}
 */
 /*
Inner.prototype.state = function (op) {

    // TODO there is a special case of server sending a new version

    // of the state because the log is too long; such a case needs
    // some special treatment by Storage to reapply local changes.
    // That is relevant to clients who have been offline for too long.
    if (this._version) {
        console.warn("a state is received by a stateful object");
    }

    var state = JSON.parse(op.value || '{}'); // unflatten POJO state
    this.apply(state);
    this._version = op.spec.filter('!').toString();

    this.emit({
        name: "init",
        value: state,
        target: this,
        old_version: '',
        spec: op.spec
    });
};*/

// Sometimes we get an operation we don't support; not normally
// happens for a regular replica, but still needs to be caught
Inner.prototype.unimplemented = function (op) {
    console.warn("method not implemented:", op.spec);
};

Syncable.reFieldName = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;

Syncable.getType = function (type_id) {
    if (Spec.is(type_id)) {
        return Syncable.types[new Spec(type_id).type()] || undefined;
    } else {
        return Syncable.types[type_id] || undefined;
    }
};

function toPojo (obj) { // .4 move to .pojo and .apply/.reset
    if (obj===undefined || obj===null) { return null; }
    switch ((obj).constructor) {
        case String:
        case Number:
        case Array: // TODO
            return obj;
        case Spec:
            return obj.toString();
        default:
            if (obj._id && typeof(obj.spec)==='function') {
                return obj.spec().toString();
            }
            if (obj.toPojo) {
                return obj.toPojo();
            }
            var pojo = {};
            for(var key in obj) {
                if (obj.hasOwnProperty(key)) {
                    pojo[key] = toPojo(obj[key]);
                }
            }
            return pojo;
    }
}
Syncable.toPojo = toPojo;


/** The most important by-value type; used as a field referencing another
  * syncable object. */
Syncable.Ref = function Ref (arg, type, host) {
    this._target = null;
    this.ref = '#0';
    if (!arg || arg==='0' || arg==='#0') {
        this.ref = '#0';
    } else if (arg._id) {
        this.ref = arg.spec().toString();
    } else {
        var spec = new Spec(arg.toString(),'#');
        spec = spec.filter('/#');
        if (spec.pattern()==='#' && type) {
            if (type.constructor===Function) {
                type = type._pt._type;
            }
            type = new Spec(type,'/');
            spec = new Spec(''+type+spec);
        }
        this.ref = spec.toString();
    }
    if (host && host.has(this.ref)) {
        this._target = host.get(this.ref);
    }
};

Syncable.Ref.prototype.toString = function () {
    return this.ref;
};

/***/
Syncable.Ref.prototype.toPojo = function () {
    return this.ref;
};

Syncable.Ref.prototype.fill = function (host) {
    if (this._target) {return;}
    if (!this.ref) { throw new Error("empty ref"); }
    if (!host) { host = env.localhost; }
    return this._target = host.get(this.ref); // TODO .4 #0 null-like obj
};

Syncable.Ref.prototype.target = function (host) {
    return this._target || this.fill(host);
};

Syncable.Ref.prototype.on = function () {
    if (!this._target) { this.fill(); }
    this._target.on.apply(this._target,arguments);
};

Syncable.Ref.prototype.once = function () {
    if (!this._target) { this.fill(); }
    this._target.once.apply(this._target,arguments);
};

Syncable.Ref.prototype.isNull = function () {
    return this.ref==='#0';
};

Syncable.Ref.prototype.call = function (method, args, cb) {
    if (!this._target) { this.fill(); }
    var _target = this._target;
    var fn = _target[method];
    if (!fn || fn.constructor!==Function) {
        throw new Error("no such method");
    }
    if (_target._version) { // stateful
        var ret = fn.apply(_target,args);
        if (cb) { cb(ret); }
    } else {
        _target.once(function(){
            var ret = fn.apply(_target,args);
            if (cb) { cb(ret); }
        });
    }
};
