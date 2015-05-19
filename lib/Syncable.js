"use strict";

var Spec = require('./Spec');
var Op = require('./Op');
var env = require('./env');

/**
 * Syncable: an oplog-synchronized object
 * Syncable(spec|id|state[,host])
 * @constructor
 */
function Syncable() {
    // The most correct way to specify a version is the version vector,
    // but that one may consume more space than the data itself in some cases.
    // Hence, _version is not a fully specified version vector (see version()
    // instead). _version is essentially is the greatest operation timestamp
    // (Lamport-like, i.e. "time+source"), sometimes amended with additional
    // timestamps. Its main features:
    // (1) changes once the object's state changes
    // (2) does it monotonically (in the alphanum order sense)
    this._version = '';
    this.reset();

    if (env.multihost) {
        if (arguments.length===2 && arguments[1].id) {
            this._host = arguments[1]; // TODO prototype._host
        } else {
            this._host = env.localhost;
            console.warn('no host specified in multihost mode');
        }
    }

    var arg0 = arguments[0];
    var spec = new Spec(this._type, '/');
    if (Spec.is(arg0) || typeof(arg0) === 'string') { // (spec|id[,host])
        spec = spec.add( new Spec(arg0, '#').filter('#!') );
    }
    if (!spec.id()) {
        var time = this._host.time();
        spec = spec.add(time,'#').set(time,'!');
        this._version = '!'+spec.version();
    }

    if (arg0 && arg0.constructor===Object) { // nice nice POJO
        this.apply(arg0);
        this._version = '!'+spec.version();
    }

    this._id = spec.id();
    var doubl = this._host.registerSyncable(spec, this);
    if (doubl !== this) { return doubl; }

    return this;
}
module.exports = Syncable;

Syncable.prototype.host = function () {
    return env.multihost ? this._host : env.localhost;
};

Syncable.types = {};
Syncable.isOpSink = function (obj) {
    if (!obj) { return false; }
    if (obj.constructor === Function) { return true; }
    if (obj.deliver && obj.deliver.constructor === Function) { return true; }
    return false;
};
Syncable.reMethodName = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;
Syncable.memberClasses = {ops:1,neutrals:1,remotes:1,defaults:1,reactions:1,mixins:1};
Syncable._default = {};

function fnname(fn) {
    if (fn.name) { return fn.name; }
    return fn.toString().match(/^function\s*([^\s(]+)/)[1];
}


/**
 * All CRDT model classes must extend syncable directly or indirectly. Syncable
 * provides all the necessary oplog- and state-related primitives and methods.
 * Every state-mutating method should be explicitly declared to be wrapped
 * by extend() (see 'ops', 'neutrals', 'remotes' sections in class declaration).
 * @param {function|string} fn
 * @param {{ops:object, neutrals:object, remotes:object}} own
 */
Syncable.extend = function (fn, own) {
    var parent = this, fnid;
    if (fn.constructor !== Function) {
        var id = fn.toString();
        fn = function SomeSyncable() {
            return parent.apply(this, arguments);
        };
        fnid = id; // if only it worked
    } else {
        // please call Syncable.constructor.apply(this,args) in your constructor
        fnid = fnname(fn);
    }

    // inheritance trick from backbone.js
    var SyncProto = function () {
        this.constructor = fn;
        this._neutrals = {};
        this._ops = {};
        this._reactions = {};

        var event,
            name;
        if (parent._pt) {
            //copy _neutrals & _ops from parent
            for (event in parent._pt._neutrals) {
                this._neutrals[event] = parent._pt._neutrals[event];
            }
            for (event in parent._pt._ops) {
                this._ops[event] = parent._pt._ops[event];
            }
        }

        // "Methods" are serialized, logged and delivered to replicas
        for (name in own.ops || {}) {
            this._ops[name] = own.ops[name];
            this[name] = wrapCall(name);
        }

        // "Neutrals" don't change the state
        for (name in own.neutrals || {}) {
            this._neutrals[name] = own.neutrals[name];
            this[name] = wrapCall(name);
        }

        // "Remotes" are serialized and sent upstream (like RPC calls)
        for (name in own.remotes || {}) {
            this[name] = wrapCall(name);
        }

        // add mixins
        (own.mixins || []).forEach(function (mixin) {
            for (var name in mixin) {
                this[name] = mixin[name];
            }
        }, this);

        // add other members
        for (name in own) {
            /*if (!Syncable.reMethodName.test(name)) {  _private
                throw new Error('invalid member name:'+name);
            }*/
            var memberType = own[name].constructor;
            if (memberType === Function) { // non-op method
                // these must change state ONLY by invoking ops
                this[name] = own[name];
            } else if (memberType===String || memberType===Number) {
                this[name] = own[name]; // some static constant, OK
            } else if (name in Syncable.memberClasses) {
                // see above
                continue;
            } else {
                throw new Error('invalid member: '+name+", "+memberType);
            }
        }

        // add reactions
        for (name in own.reactions || {}) {
            var reaction = own.reactions[name];
            if (!reaction) { continue; }

            switch (typeof reaction) {
            case 'function':
                // handler-function
                this._reactions[name] = [reaction];
                break;
            case 'string':
                // handler-method name
                this._reactions[name] = [this[name]];
                break;
            default:
                if (reaction.constructor === Array) {
                    // array of handlers
                    this._reactions[name] = reaction.map(function (item) {
                        switch (typeof item) {
                        case 'function':
                            return item;
                        case 'string':
                            return this[item];
                        default:
                            throw new Error('unexpected reaction type');
                        }
                    }, this);
                } else {
                    throw new Error('unexpected reaction type');
                }
            }
        }

        var syncProto = this;
        this.callReactions = function (spec, value, src) {
            var superReactions = syncProto._super.callReactions;
            if ('function' === typeof superReactions) {
                superReactions.call(this, spec, value, src);
            }
            var r = syncProto._reactions[spec.op()];
            if (r) {
                r.constructor !== Array && (r = [r]);
                for (var i = 0; i < r.length; i++) {
                    r[i] && r[i].call(this, spec, value, src);
                }
            }
        };

        this._super = parent.prototype;
        this._type = fnid;
    };

    SyncProto.prototype = parent.prototype;
    fn.prototype = new SyncProto();
    fn._pt = fn.prototype; // just a shortcut

    // default field values
    var key;
    var defs = fn.defaults = {};
    for (key in (parent.defaults || {})) {
        defs[key] = normalizeDefault(parent.defaults[key]);
    }
    for (key in (own.defaults || {})) {
        defs[key] = normalizeDefault(own.defaults[key]);
    }

    function normalizeDefault(val) {
        if (val && val.type) {
            return val;
        }
        if (val && val.constructor === Function) {
            return {type: val, value: undefined};
        }
        return {type:val.constructor, value: val};
    }

    // signature normalization for logged/remote/local method calls;
    function wrapCall(name) { // FIXME .4 kill this? ops are not API methods
        if (!Syncable.reMethodName.test(name)) {
            throw new Error("invalid method name: "+name);
        }
        return function wrapper() {
            // assign a Lamport timestamp
            var spec = this.newEventSpec(name);
            var args = Array.prototype.slice.apply(arguments), lstn;
            // find the callback if any
            Syncable.isOpSink(args[args.length - 1]) && (lstn = args.pop());
            // prettify the rest of the arguments
            for(var i=0; i<args.length; i++) {
                args[i] = toPojo(args[i]);
            }
            if (!args.length) {  // FIXME isn't it confusing?
                args = ''; // used as 'empty'
            } else if (args.length === 1) {
                args = args[0]; // {key:val}
                if (args.constructor!==String) {
                    args = JSON.stringify(args);
                }
            }
            // it would be much nicer to have unified code paths for
            // local and remote ops, but asynchronous local edits are
            // a bit too unconventional...
            this.deliver(spec, args, lstn) &&
                this._host.deliver(spec, args, lstn);
        };
    }

    // finishing touches
    fn._super = parent;
    fn.extend = this.extend;
    fn.addReaction = this.addReaction;
    fn.removeReaction = this.removeReaction;
    Syncable.types[fnid] = fn;
    return fn;
};

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
Syncable.extend(Syncable, {  // :P
    /**
     * @returns {Spec} specifier "/Type#objid"
     */
    spec: function () { return new Spec('/' + this._type + '#' + this._id); },

    /**
     * Generates new specifier with unique version
     * @param {string} op operation
     * @returns {Spec}
     */
    newEventSpec: function (op) {
        return this.spec().add(this._host.time(), '!').add(op, '.');
    },

    /**
     * Returns current object state specifier
     * @returns {string} specifier "/Type#objid!version+source[!version+source2...]"
     */
    stateSpec: function () {
        return this.spec() + (this._version || ''); //?
    },

    /**
     * Applies a serialized operation (or a batch thereof) to this replica
     */
    deliver: function (spec, value, lstn, delay_emit) {
        spec = Spec.as(spec);
        var opver = '!' + spec.version();
        var error;
        var op_ret = undefined;

        function fail(msg, ex) {
            console.error(msg, spec, value, (ex && ex.stack) || ex || new Error(msg));
            if (typeof(lstn) === 'function') {
                lstn(spec.set('.fail'), msg);
            } else if (lstn && typeof(lstn.error) === 'function') {
                lstn.error(spec, msg);
            } // else { } no callback provided
        }

        // sanity checks
        if (spec.pattern() !== '/#!.') {
            return fail('malformed spec', spec);
        }
        if (!this._id) {
            return fail('undead object invoked');
        }
        if (error = this.validate(spec, value)) {
            return fail('invalid input, ' + error, value);
        }
        if (!this.acl(spec, value, lstn)) {
            return fail('access violation', spec);
        }

        env.logs.logix && console.log('#'+this._id+
            (env.multihost?'@'+this._host.id:''),
            spec.toString(), value);

        try { // FIXME .4 try-wrap impl only, emit has its own wraps
            var call = spec.op();
            if (this._ops[call]) {  // FIXME name=>impl table
                if (this.isReplay(spec)) { // it happens
                    console.warn('replay', spec.toString());
                    return;
                }
                if (!this._version && spec.op() !== 'state') {
                    return fail('op applied to a stateless object', spec);
                }
                // invoke the implementation
                op_ret =
                this._ops[call].call(this, spec, value, lstn);

                var vv = new Spec.Map(this._version);
                vv.add(spec.filter('!'));
                this._version = vv.toString();

                // TODO obsolete
                // once applied, may remember in the log...
                    // this._version is practically a label that lets you know whether
                    // the state has changed. Also, it allows to detect some cases of
                    // concurrent change, as it is always set to the maximum version id
                    // received by this object. Still, only the full version vector may
                    // precisely and uniquely specify the current version (see version()).
                //    this._version = (opver > this._version) ? opver : this._version + opver;
                    // ...and relay further to downstream replicas and various listeners

                this.callReactions(spec, value, lstn);

                if (this._events && !delay_emit) {
                    this.emit4();
                }
            } else if (this._neutrals[call]) {
                // invoke the implementation
                op_ret =
                this._neutrals[call].call(this, spec, value, lstn);

            } else {
                this.unimplemented(spec, value, lstn);
            }
        } catch (ex) { // log and rethrow; don't relay further; don't log
            return fail("method execution failed", ex);
        }

        // to force async signatures we eat the returned value silently
        return op_ret || spec;
    },


    trigger: function (event, params) {
        var spec = this.newEventSpec(event);
        this.deliver(spec, params);
    },

    /**
     * Blindly applies a JSON changeset to this model.
     * @param {*} values
     */
    apply: function (values) {
        // TODO .4  (1) rename
        var old_vals = {};
        for (var key in values) {
            if (!Syncable.reFieldName.test(key)) {continue;}
            var def = this.constructor.defaults[key];
            if (!def) {throw new Error("unknown field: "+key);}
            var val = values[key];
            old_vals[key] = this[key];
            if (val===undefined || val===null) {
                this[key] = null;
            } else if (val.constructor===def.type) {
                this[key] = val;
            } else {
                this[key] = new def.type(val); //unflatten by-value types
            }
        }
        return old_vals;
    },

    /** Syncable object version transitions:
     *
     *             ''                    state unknown
     *              ↓
     *             !0                    default/initial state
     *              ↓
     *   ↻ !time1+src1!time2+src2        version vector
     *              ↓
     *           !~~~~~                  deleted
     *
     * @returns {Spec.Map} the version vector for this object
     */
    version: function () {
        return new Spec.Map(this._version);
    },

    /**
     * The method must decide whether the source of the operation has
     * the rights to perform it. The method may check both the nearest
     * source and the original author of the op.
     * If this method ever mentions 'this', that is a really bad sign.
     * @returns {boolean}
     */
    acl: function (spec, val, src) {
        return true;
    },

    /**
     * Check operation format/validity (recommendation: don't check against the current state)
     * @returns {string} '' if OK, error message otherwise.
     */
    validate: function (spec, val, src) {
        if (spec.pattern() !== '/#!.') {
            return 'incomplete event spec';
        }
        if (this.clock && spec.type()!=='Host' && !this.clock.checkTimestamp(spec.version())) {
            return 'invalid timestamp '+spec;
        }
    },

    /**
     * whether this op was already applied in the past
     * @returns {boolean}
     */
    isReplay: function (spec) {
        if (!this._version) { return false; }
        var opver = spec.version();
        var vv = new Spec.Map(this._version);
        return vv.covers(opver);
    },

    /**
     * External objects (those you create by supplying an id) need first to query
     * the uplink for their state. Before the state arrives they are stateless.
     * @return {boolean}
     */
    hasState: function () {
        return !!this._version;
    },

    reset: function () {
        var defs = this.constructor.defaults;
        for (var name in defs) {
            var def = defs[name];
            switch (def.type) {
                case String:
                case Number:
                    this[name] = def.value; // immutables
                    break;
                default:
                    this[name] = def.value===undefined ?
                        new def.type() : new def.type(def.value);
            }
        }
    },

    neutrals: {

        /**
         * As all the event/operation processing is asynchronous, we
         * cannot simply throw/catch exceptions over the network.
         * This method allows to send errors back asynchronously.
         * Sort of an asynchronous complaint mailbox :)
         */
        error: function (spec, val, repl) {
            console.error('something failed:', spec, val, '@', (repl && repl._id));
        },

        /** For performance optimization and, sometimes, for atomicity,
         *  a sender may bundle operations. Note that events are emitted
         *  *after* the complete bundle is processed. */
        bundle: function (spec, value, source) {
            var ti = spec.filter('/#'), self=this;
            var op = new Op(spec, value, source);
            var ops = op.unbundle();
            ops.forEach(function(op) {
                self.deliver(ti.add(op.spec), op.value, source);
            });
            this.emit4();
        },

    }, // neutrals

    ops: {

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
        state: function (spec, state, src) {

            // TODO there is a special case of server sending a new version
            // of the state because the log is too long; such a case needs
            // some special treatment by Storage to reapply local changes.
            // That is relevant to clients who have been offline for too long.
            if (this._version) {
                console.warn("a state is received by a stateful object");
            }

            if (state.constructor===String) { // flattened POJO state
                state = JSON.parse(state);
            }
            this.apply(state);

            if (this._events) {
                this._events.queued.push({
                    name: "init",
                    value: state,
                    target: this,
                    old_version: '',
                    spec: spec
                });
            }
        }

    }, // ops

    /**
     * returns a Plain Javascript Object with the state
     * @this {Syncable}
     */
    toPojo: function (addMetadata) {
        var pojo = {},
            defs = this.constructor.defaults;
        for(var key in defs) {
            if (Syncable.reFieldName.test(key)) {
                pojo[key] = toPojo(this[key]);
            }
        }
        if (addMetadata) {
            //pojo._id = this._id; // not necassary
            pojo._version = this._version;
            //this._vector && (pojo._vector = this._vector);
        }
        return pojo;
    },

    /**
     * Sometimes we get an operation we don't support; not normally
     * happens for a regular replica, but still needs to be caught
     */
    unimplemented: function (spec, val, repl) {
        console.warn("method not implemented:", spec);
    },

    /**
     * Deallocate everything, free all resources.
     */
    close: function () {
        this.host().unregisterSyncable(this);
    },

    /**
     * Once an object is not listened by anyone it is perfectly safe
     * to garbage collect it.
     */
    gc: function () {
        if (!this._events) {
            this.close();
        }
    },

    on4: function (filter, callback, context) {
        if ( filter && filter.constructor===Function &&
             (!callback || callback.constructor!==Function) ) {
            context = callback;
            callback = filter;
            filter = null;
        }
        if (!this._events) {
            this._events = {listeners:[],queued:[]};
        }
        this._events.listeners.push({
            callback: callback,
            filter: filter||null,
            context: context||null
        });
    },

    off4: function(filter,callback,context) {
        if (!this._events) {return;}
        if (filter.constructor===Function) {
            context = callback;
            callback = filter;
            filter = null;
        }
        filter = filter || null;
        context = context || null;
        this._events.listeners = this._events.listeners.filter (
            function (l) {
                return  l.callback!==callback;
            }
        );
        if (this._events.listeners.length===0) {
            this._events = null;
        }
    },

    emit4: function (event) {
        event && this._events && this._events.queued.push(event);
        while (this._events && this._events.queued.length) {
            var ev = this._events.queued.shift();
            ev.target = this;
            this._events.listeners.forEach(function(l){
                if (l.filter) {
                    var ftype = l.filter.constructor;
                    if (ftype===String && l.filter!==ev.name) {
                        return;
                    } else if (ftype===Function && !l.filter(ev)) {
                        return;
                    }
                }
                try {
                    l.callback.call(l.context,ev);
                } catch (ex) {
                    console.error("listener failed", ex.message, ex.stack);
                }
            });
        }
    },

    once4: function (filter,callback,context) {
        var self = this;
        self.on4(filter, function wrapper (ev) {
            callback.call(this,ev);
            self.off4(filter,wrapper,context);
        }, context);
    },

    onInit4: function (callback,context) {
        if (this._version) {
            callback.call(context||this, null);
        } else {
            this.once4('init', callback, context);
        }
    },

    onLoad4: function (callback, context) {
        // FIXME .4 wait all Refs to load
        // FIXME no refs => same as .init
        this.once4('load', callback, context);
    }

});


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
            if (obj._id && obj.spec) {
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
