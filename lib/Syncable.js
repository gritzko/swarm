'use strict';

var VersionVector = require('./VersionVector');
var Spec          = require('./Spec');
var swarmOptions  = require('./options');

var reFieldName = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;

/**
 * Syncable: an oplog-synchronized object
 * @constructor
 */
function Syncable() {
    // listeners represented as objects that have deliver() method
    this._lstn = [',']; // we unshift() uplink listeners and push() downlinks
    // ...so _lstn is like [server1, server2, storage, ',', view, listener]
    // The most correct way to specify a version is the version vector,
    // but that one may consume more space than the data itself in some cases.
    // Hence, _version is not a fully specified version vector (see version()
    // instead). _version is essentially is the greatest operation timestamp
    // (Lamport-like, i.e. "time+source"), sometimes amended with additional
    // timestamps. Its main features:
    // (1) changes once the object's state changes
    // (2) does it monotonically (in the alphanum order sense)
    this._version = '';
    // make sense of arguments
    var args = Array.prototype.slice.call(arguments);
    this._host = (args.length && args[args.length-1].isHost) ?
        args.pop() : swarmOptions.localhost;
    if (Spec.is(args[0])) {
        this._id = new Spec(args.shift()).id() || this._host.time();
    }else if (typeof(args[0])==='string') {
        this._id = args.shift(); // TODO format
    } else {
        this._id=this._host.time();
        this._version = '!0'; // may apply state in the constructor, see Model
    }
    //var state = args.length ? args.pop() : (fresh?{}:undefined);
    // register with the host
    var doubl = this._host.register(this);
    if (doubl!==this) return doubl;
    // locally created objects get state immediately
    // (while external-id objects need to query uplinks)
    /*if (fresh && state) {
        state._version = '!'+this._id;
        var pspec = this.spec().add(state._version).add('.patch');
        this.deliver(pspec,state,this._host);
    }*/
    // find uplinks, subscribe
    this.checkUplink();
    return this;
};

Syncable.types = {};
Syncable.isOpSink = function (obj) {
    if (!obj) return false;
    if (obj.constructor===Function) return true;
    if (obj.deliver && obj.deliver.constructor===Function) return true;
    return false;
};
Syncable.popSink = function (args) {
};
Syncable.reMethodName = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;
Syncable._default = {};
function fnname (fn) {
    if (fn.name) return fn.name;
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
    if (fn.constructor!==Function) {
        var id = fn.toString();
        fn = function SomeSyncable(){
            this.reset(); // FIXME repeated initialization
            return parent.apply(this, arguments);
        };
        fnid = id; // if only it worked
    } else { // please call Syncable.constructor.apply(this,args) in your constructor
        fnid = fnname(fn);
    }

    // inheritance trick from backbone.js
    var SyncProto = function () {
        this.constructor = fn;
        this._neutrals = {};
        this._ops = {};
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
            if (!Syncable.reMethodName.test(name)) continue;
            this._ops[name] = own.ops[name];
            this[name] = wrapCall(name);
        }

        // "Neutrals" don't change the state
        for (name in own.neutrals || {}) {
            if (!Syncable.reMethodName.test(name)) continue;
            this._neutrals[name] = own.neutrals[name];
            this[name] = wrapCall(name);
        }

        // "Remotes" are serialized and sent upstream (like RPC calls)
        for (name in own.remotes || {}) {
            if (!Syncable.reMethodName.test(name)) continue;
            this[name] = wrapCall(name);
        }

        for (name in own) {
            if (!Syncable.reMethodName.test(name) ||
                    own[name].constructor !== Function) continue;
            this[name] = own[name];
        }
        this._super = parent.prototype;
        this._reactions = {};
        this._type = fnid;
    };

    SyncProto.prototype = parent.prototype;
    fn.prototype = new SyncProto();
    fn._pt = fn.prototype; // just a shortcut

    // default field values
    var defs = fn.defaults = own.defaults || {};
    for (var k in defs) {
        if (defs[k].constructor === Function) {
            defs[k] = {type: defs[k]};
        }
    }

    // signature normalization for logged/remote/local method calls;
    function wrapCall(name) {
        return function wrapper () {
            // assign a Lamport timestamp
            var spec = this.newEventSpec(name);
            var args = Array.prototype.slice.apply(arguments), lstn;
            // find the callback if any
            Syncable.isOpSink(args[args.length-1]) && (lstn = args.pop());
            // prettify the rest of the arguments
            if (!args.length) {  // FIXME isn't it confusing?
                args = ''; // used as 'empty'
            } else if (args.length===1) {
                args = args[0]; // {key:val}
            }
            // TODO log 'initiated'
            this.deliver(spec,args,lstn);
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
    if (i === -1) throw new Error('reaction unknown');

    list[i] = undefined; // such a peculiar pattern not to mess up out-of-callback removal
    while (list.length && !list[list.length-1]) list.pop();
};

/**
 * compare two listeners
 * @param {{deliver:function, _src:*, sink:function}} ln listener from syncable._lstn
 * @param {function|{deliver:function}} other some other listener or function
 * @returns {boolean}
 */
Syncable.listenerEquals = function (ln, other) {
    return !!ln && ((ln === other) ||
        (ln._src && ln._src === other) ||
        (ln.sink && ln.sink === other));
};


// Syncable includes all the oplog, change propagation and distributed
// garbage collection logix.
Syncable.extend(Syncable, {  // :P
    /**
     * @returns {Spec} specifier "/Type#objid"
     */
    spec: function () { return new Spec('/'+this._type+'#'+this._id); },

    /**
     * Generates new specifier with unique version
     * @param {string} op operation
     * @returns {Spec}
     */
    newEventSpec: function (op) {
        return this.spec().add(this._host.time(),'!').add(op,'.');
    },

    /**
     * Returns current object state specifier
     * @returns {string} specifier "/Type#objid!version+source[!version+source2...]"
     */
    stateSpec: function () {
        return this.spec() + (this._version||''); //?
    },

    /**
     * Applies a serialized operation (or a batch thereof) to this replica
     */
    deliver: function (spec, value, lstn) {
        spec = Spec.as(spec);
        var opver = '!' + spec.version(),
            error = null;

        function fail (msg,ex) {
            console.error(msg, spec, value, (ex&&ex.stack)||ex||new Error(msg));
            if (typeof(lstn) === 'function') {
                lstn(spec.set('.fail'), msg);
            } else if (lstn && typeof(lstn.error) === 'function') {
                lstn.error(spec, msg);
            } else { } // no callback provided
        }

        // sanity checks
        if (spec.pattern() !== '/#!.') return fail('malformed spec', spec);

        if (!this._id) return fail('undead object invoked');

        if (error = this.validate(spec, value)) return fail('invalid input, ' + error, value);

        if (!this.acl(spec, value, lstn)) return fail('access violation', spec);

        swarmOptions.debug && this.log(spec, value, lstn);

        try{
            var call = spec.op();
            if (this._ops[call]) {  // FIXME name=>impl table
                if (this.isReplay(spec)) { // it happens
                    console.warn('replay',spec);
                    return;
                }
                // invoke the implementation
                this._ops[call].call(this, spec, value, lstn); // NOTE: no return value
                // once applied, may remember in the log...
                if (spec.op() !== 'patch') {
                    this._oplog && (this._oplog[spec.filter('!.')] = value);
                    // this._version is practically a label that lets you know whether
                    // the state has changed. Also, it allows to detect some cases of
                    // concurrent change, as it is always set to the maximum version id
                    // received by this object. Still, only the full version vector may
                    // precisely and uniquely specify the current version (see version()).
                    this._version = (opver > this._version) ? opver : this._version + opver;
                }
                // ...and relay further to downstream replicas and various listeners
                this.emit(spec, value, lstn);
            } else if (this._neutrals[call]) {
                // invoke the implementation
                this._neutrals[call].call(this, spec, value, lstn);
                // and relay to listeners
                this.emit(spec, value, lstn);
            } else {
                this.unimplemented(spec, value, lstn);
            }
        } catch(ex) { // log and rethrow; don't relay further; don't log
            return fail("method execution failed", ex);
        }

        // to force async signatures we eat the returned value silently
        return spec;
    },

    /**
     * Notify all the listeners of a state change (i.e. the operation applied).
     */
    emit: function (spec, value, src) {
        var ls = this._lstn,
            op = spec.op(),
            is_neutrals = !!this._neutrals[op];
        if (ls) {
            var notify = [];
            for(var i=0; i<ls.length; i++) {
                var l = ls[i];
                // skip empties, deferreds and the source
                if (!l || l===',' || l===src) continue;
                if (is_neutrals && l._op!==op) continue;
                if (l._op && l._op!==op) continue;
                notify.push(l);
            }
            for(i=0; i<notify.length; i++) { // screw it I want my 'this'
                try {
                    notify[i].deliver(spec, value, this);
                } catch (ex) {
                    console.error(ex.message, ex.stack);
                }
            }
        }
        var r = this._reactions[spec.op()];
        if (r) {
            r.constructor!==Array && (r = [r]);
            for (i = 0; i < r.length; i++) {
                r[i] && r[i].call(this, spec, value, src);
            }
        }
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
        for (var key in values) {
            if (key.charAt(0) === '_') continue; //skip special fields
            var def = this.constructor.defaults[key];
            this[key] = def && def.type ? new def.type(values[key]) : values[key];
        }
    },

    /**
     * @returns {VersionVector} the version vector for this object
     */
    version: function () {
        // distillLog() may drop some operations; still, those need to be counted
        // in the version vector; so, their Lamport ids must be saved in this._vector
        var map = new VersionVector(this._version + (this._vector || ''));
        if (this._oplog) for (var op in this._oplog) map.add(op);
        return map; // TODO return the object, let the consumer trim it to taste
    },

    /**
     * Produce the entire state or probably the necessary difference
     * to synchronize a replica which is at version *base*.
     * @returns {{_version:String, _tail:Object, *}} a state object
     * that must survive JSON.parse(JSON.stringify(obj))
     *
     * The size of a Model's distilled log is capped by the number of
     * fields in an object. In practice, that is a small number, so
     * Model uses its distilled log to transfer state (no snapshots).
     */
    diff: function (base) {
        //var vid = new Spec(this._version).get('!'); // first !token
        //var spec = vid + '.patch';
        this.distillLog(); // TODO optimize?
        var patch, spec;
        if (base && base!='!0' && base!='0') { // FIXME ugly
            var map = new VersionVector(base || '');
            for (spec in this._oplog) {
                if (!map.covers(new Spec(spec).version())) {
                    patch = patch || { _tail: {} }; // NOTE: no _version
                    patch._tail[spec] = this._oplog[spec];
                }
            }
        } else {
            patch = {_version: '!0', _tail: {}};
            for (spec in this._oplog) patch._tail[spec] = this._oplog[spec];
        }
        return patch;
    },

    distillLog: function () {
    },

    /**
     * The method must decide whether the source of the operation has
     * the rights to perform it. The method may check both the nearest
     * source and the original author of the op.
     * If this method ever mentions 'this', that is a really bad sign.
     * @returns {boolean}
     */
    acl: function (spec,val,src) {
        return true;
    },

    /**
     * Check operation format/validity (recommendation: don't check against the current state)
     * @returns {string} '' if OK, error message otherwise.
     */
    validate: function (spec, val, src) {
        // TODO add causal stability violation check  Swarm.EPOCH  (+tests)
        return '';
    },

    /**
     * whether this op was already applied in the past
     * @returns {boolean}
     */
    isReplay: function (spec) {
        if (!this._version) return false;
        if (spec.op()==='patch') return false; // these are .on !vids
        var opver = spec.version();
        if (opver > this._version.substr(1)) return false;
        if (spec.filter('!.').toString() in this._oplog) return true; // TODO log trimming, vvectors?
        return this.version().covers(opver); // heavyweight
    },

    /**
     * External objects (those you create by supplying an id) need first to query
     * the uplink for their state. Before the state arrives they are stateless.
     * @return {boolean}
     */
    hasState: function() {
        return !!this._version;
    },

    getListenerIndex: function (search_for, uplinks_only) {
        var i = this._lstn.indexOf(search_for),
            l;
        if (i > -1) return i;

        for (i = 0, l = this._lstn.length; i < l; i++) {
            var ln = this._lstn[i];
            if (uplinks_only && ln === ',') return -1;
            if (Syncable.listenerEquals(ln, search_for)) return i;
        }
        return -1;
    },

    reset: function () {
        for (var fn = this.constructor; fn !== Syncable; fn = fn._super) {
            for (var name in fn.defaults) {
                var dv = fn.defaults[name];
                this[name] = dv.constructor === Object ? new dv.type(dv.value) : dv;
            }
        }
    },

    isUplinked: function () {
        if (this._lstn[0]===',') return false; // FIXME this is a crime
        for(var i=0; i<this._lstn.length && this._lstn[i]!==','; i++)
            if (this._lstn[i] && ('_op' in this._lstn[i]))
                return false; // filtered uplink => not ready yet
        return true;
    },

    neutrals: {
        /**
         * Subscribe to the object's operations;
         * the upstream part of the two-way subscription
         *  on() with a full filter:
         *  @param {Spec} spec /Mouse#Mickey!now.on
         *  @param {Spec|string} filter !since.event
         *  @param {{deliver:function}|function} repl callback
         *  @this {Syncable}
         */
        on: function (spec, filter, repl) {   // WELL  on() is not an op, right?
            // if no listener is supplied then the object is only
            // guaranteed to exist till the next Swarm.gc() run
            if (!repl) return;
            var self = this;
            // stateless objects fire no events; essentially, on() is deferred
            if (!this._version && !self.isUplinked()) {
                this._lstn.push({
                    _op: 'reon', // may not happen
                    _src: repl,
                    deliver: function () {
                        if (!self._version && !self.isUplinked()) return; // wait
                        var i = self._lstn.indexOf(this);
                        self._lstn.splice(i,1);
                        self.deliver(spec,filter,repl);
                    }
                });
                return; // defer this call till uplinks are ready
            }
            // make all listeners uniform objects
            if (repl.constructor === Function) {
                repl = {
                    sink: repl,
                    that: this,
                    deliver: function () { // .deliver is invoked on an event
                        this.sink.apply(this.that, arguments);
                    }
                };
            }

            if (filter) {
                filter = new Spec(filter,'.');
                var baseVersion = filter.get('!'),
                    filter_by_op = filter.get('.');

                if (filter_by_op === 'init'){
                    var diff_if_needed = baseVersion ? this.diff(baseVersion) : '';
                    repl.deliver (spec.set('.patch'), diff_if_needed, this); //??
                    // use once()
                    return;
                }
                if (filter_by_op) {
                    repl = {
                        sink: repl,
                        _op: filter_by_op,
                        deliver: function deliverWithFilter(spec, val, src) {
                            if (spec.op() === filter_by_op) {
                                this.sink.deliver(spec, val, src);
                            }
                        }
                    };
                }

                if (baseVersion) {
                    var diff = this.diff(baseVersion);
                    diff && repl.deliver(spec.set('.patch'), diff, this); // 2downlink
                    repl.deliver (spec.set('.reon'), this.version().toString(), this);
                }
            }

            this._lstn.push(repl);
            // TODO repeated subscriptions: send a diff, otherwise ignore
        },

        /**
         * downstream reciprocal subscription
         */
        reon: function (spec, base, repl) {
            var diff = base && this.diff(base);
            if (diff) repl.deliver(spec.set('.patch'), diff, this); // 2uplink
        },

        /** Unsubscribe */
        off: function (spec, val, repl) {
            var idx = this.getListenerIndex(repl); //TODO ??? uplinks_only?
            if (idx > -1) this._lstn.splice(idx, 1);
        },

        /** Reciprocal unsubscription */
        reoff: function (spec, val, repl) {
            var idx = this.getListenerIndex(repl); //TODO ??? uplinks_only?
            if (idx > -1) this._lstn.splice(idx, 1);
            if (this._id) this.checkUplink();
        },

        /**
         * As all the event/operation processing is asynchronous, we
         * cannot simply throw/catch exceptions over the network.
         * This method allows to send errors back asynchronously.
         * Sort of an asynchronous complaint mailbox :)
         */
        error: function (spec, val, repl) {
            console.error('something failed:',spec,val,'@',(repl&&repl._id));
        },

    }, // neutrals

    ops: {
        /**
         * A state of a Syncable CRDT object is transferred to a replica using
         * some combination of POJO state and oplog. For example, a simple LWW
         * object (Last Writer Wins, see Model below) uses its distilled oplog
         * as the most concise form. A CT document (Causal Trees) has a highly
         * compressed state, its log being hundred times heavier. Hence, it
         * mainly uses its plain state, but sometimes its log tail as well. The
         * format of the state object is POJO plus (optionally) special fields:
         * _oplog, _tail, _vector, _version (the latter flags POJO presence).
         * In either case, .state is only produced by diff() (+ by storage).
         * Any real-time changes are transferred as individual events.
         * @this {Syncable}
         */
        patch: function (spec, state, src) {

            var tail = {}, // ops to be applied on top of the received state
                typeid = spec.filter('/#'),
                lstn = this._lstn,
                a_spec;
            this._lstn = []; // prevent events from being fired

            /*if (state._version === '!0') { // uplink knows nothing FIXME dubious
                if (!this._version) this._version = '!0';
            }*/

            if (state._version/* && state._version !== '!0'*/) {
                // local changes may need to be merged into the received state
                if (this._oplog) {
                    for (a_spec in this._oplog) tail[a_spec] = this._oplog[a_spec];
                    this._oplog = {};
                }
                this._vector && (this._vector=undefined);
                // zero everything
                for (var key in this)
                    if (this.hasOwnProperty(key) && key.charAt(0)!=='_')
                        this[key]=undefined;
                // set default values
                this.reset();

                this.apply(state);
                this._version = state._version;

                state._oplog && (this._oplog = state._oplog); // FIXME copy
                state._vector && (this._vector = state._vector);
            }
            // add the received tail to the local one
            if (state._tail) {
                for (a_spec in state._tail) tail[a_spec] = state._tail[a_spec];
            }
            // appply the combined tail to the new state
            var specs = [];
            for (a_spec in tail) specs.push(a_spec);
            specs.sort().reverse();
            // there will be some replays, but those will be ignored
            while (a_spec = specs.pop()) this.deliver(typeid.add(a_spec), tail[a_spec], src);

            this._lstn = lstn;

        }

    }, // ops


    /**
     * Uplink connections may be closed or reestablished so we need
     * to adjust every object's subscriptions time to time.
     * @this {Syncable}
     */
    checkUplink: function () {
        var new_uplinks = this._host.getSources(this.spec()).slice(),
            up, self=this;
        // the plan is to eliminate extra subscriptions and to
        // establish missing ones; that only affects outbound subs
        for (var i = 0; i < this._lstn.length && this._lstn[i] != ','; i++) {
            up = this._lstn[i];
            if (!up) continue;
            up._src && (up = up._src); // unready
            var up_idx = new_uplinks.indexOf(up);
            if (up_idx === -1) { // don't need this uplink anymore
                up.deliver(this.newEventSpec('off'), '', this);
            } else {
                new_uplinks[up_idx] = undefined;
            }
        }
        // subscribe to the new
        for (i = 0; i < new_uplinks.length; i++) {
            up = new_uplinks[i];
            if (!up) continue;
            var onspec = this.newEventSpec('on');
            this._lstn.unshift({
                _op: 'reon',
                _src: up,
                deliver: function (spec,base,src) {
                    if (spec.version() !== onspec.version()) return; // not mine

                    var i = self.getListenerIndex(this);
                    self._lstn[i] = up;
                }
            });
            up.deliver(onspec, this.version().toString(), this);
        }
    },

    /**
     * returns a Plain Javascript Object with the state
     * @this {Syncable}
     */
    pojo: function (addVersionInfo) {
        var pojo = {},
            defs = this.constructor.defaults;
        for (var key in this) if (this.hasOwnProperty(key)) {
            if (reFieldName.test(key) && this[key] !== undefined) {
                var def = defs[key],
                    val = this[key];
                pojo[key] = def && def.type ?
                        (val.toJSON && val.toJSON()) || val.toString() :
                        (val && val._id ? val._id : val) ; // TODO prettify
            }
        }
        if (addVersionInfo) {
            pojo._id = this._id; // not necassary
            pojo._version = this._version;
            this._vector && (pojo._vector = this._vector);
            this._oplog && (pojo._oplog = this._oplog); //TODO copy
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
        var l = this._lstn,
            s = this.spec(),
            uplink;

        this._id = null; // no id - no object; prevent relinking
        while ((uplink = l.shift()) && uplink !== ',') {
            uplink.off(s, null, this);
        }
        while (l.length) {
            l.pop().deliver(s.set('.reoff'), null, this);
        }
        this._host.unregister(this);
    },

    /**
     * Once an object is not listened by anyone it is perfectly safe
     * to garbage collect it.
     */
    gc: function () {
        var l = this._lstn;
        if (!l.length || (l.length === 1 && !l[0])) this.close();
    },

    log: function(spec, value, replica) {
        var myspec = this.spec().toString(); //:(
        console.log('@%s  %s %s  %j  %s@%s',
                //"color: #888",
                this._host._id,
                //"color: #246",
                this.spec().toString(),
                //"color: #024; font-style: italic",
                (myspec==spec.filter('/#')?
                        spec.filter('!.').toString() :
                        spec.toString()),
                //"font-style: normal; color: #042",
                (value&&value.constructor===Spec?value.toString():value),
                //"color: #88a",
                        (replica&&((replica.spec&&replica.spec().toString())||replica._id)) ||
                        (replica?'no id':'undef'),
                //"color: #ccd",
                        replica && (replica._host&&replica._host._id || replica._id)
                //replica&&replica.spec&&(replica.spec()+
                //    (this._host===replica._host?'':' @'+replica._host._id)
        );
    },
    once: function (filter, fn) { // only takes functions; syncables don't need 'once'
        this.on(filter, function onceWrap() {
            fn.apply(this, arguments); // "this" is the object
            this.off(filter, onceWrap);
        });
    }
});

module.exports = Syncable;
