//  S P E C I F I E R
//
//  The Swarm aims to switch fully from the classic HTTP
//  request-response client-server interaction pattern to continuous
//  real-time synchronization (WebSocket), possibly involving
//  client-to-client interaction (WebRTC) and client-side storage
//  (WebStorage). That demands (a) unification of transfer and storage
//  where possible and (b) transferring, processing and storing of
//  fine-grained changes.
//
//  That's why we use compound event identifiers named *specifiers*
//  instead of just regular "plain" object ids everyone is so used to.
//  Our ids have to fully describe the context of every small change as
//  it is likely to be delivered, processed and stored separately from
//  the rest of the related state.  For every atomic operation, be it a
//  field mutation or a method invocation, a specifier contains its
//  class, object id, a method name and, most importantly, its
//  version id.
//
//  A serialized specifier is a sequence of Base64 tokens each prefixed
//  with a "quant". A quant for a class name is '/', an object id is
//  prefixed with '#', a method with '.' and a version id with '!'.  A
//  special quant '+' separates parts of each token.  For example, a
//  typical version id looks like "!7AMTc+gritzko" which corresponds to
//  a version created on Tue Oct 22 2013 08:05:59 GMT by @gritzko (see
//  Host.time()).
//
//  A full serialized specifier looks like
//        /TodoItem#7AM0f+gritzko.done!7AMTc+gritzko
//  (a todo item created by @gritzko was marked 'done' by himself)
//
//  Specifiers are stored in strings, but we use a lightweight wrapper
//  class Spec to parse them easily. A wrapper is immutable as we pass
//  specifiers around a lot.

function Spec (str,quant) {
    if (str && str.constructor===Spec) {
        str=str.value;
    } else { // later we assume value has valid format
        str = (str||'').toString();
        if (quant && str.charAt(0)>='0')
            str = quant + str;
        if (str.replace(Spec.reQTokExt,''))
            throw new Error('malformed specifier: '+str);
    }
    this.value = str;
    this.index = 0;
}

Swarm = {};
if (typeof(require)==='function') {
    module.exports = exports = Swarm;
}
Swarm.Spec = Spec;

Spec.prototype.filter = function (quants) {
    return new Spec(
        this.value.replace(Spec.reQTokExt,function (token,quant) {
            return quants.indexOf(quant)!==-1 ? token : '';
        })
    );
};
Spec.pattern = function (spec) {
    return spec.toString().replace(Spec.reQTokExt,'$1');
};
Spec.prototype.pattern = function () {
    return Spec.pattern(this.value);
};
Spec.prototype.token = function (quant) {
    var at = quant ? this.value.indexOf(quant,this.index) : this.index;
    if (at===-1) return undefined;
    Spec.reQTokExt.lastIndex = at;
    var m=Spec.reQTokExt.exec(this.value);
    this.index = Spec.reQTokExt.lastIndex;
    if (!m) return undefined;
    return { quant: m[1], body: m[2], bare: m[3], ext: m[4] };
};
Spec.prototype.get = function specGet (quant) {
    var i = this.value.indexOf(quant);
    if (i===-1) return '';
    Spec.reQTokExt.lastIndex = i;
    var m=Spec.reQTokExt.exec(this.value);
    return m&&m[2];
};
Spec.prototype.has = function specHas (quant) {
    return this.value.indexOf(quant)!==-1;
};
Spec.prototype.set = function specSet (spec,quant) {
    var ret = new Spec(spec,quant), m=[];
    Spec.reQTokExt.lastIndex = 0;
    while (m=Spec.reQTokExt.exec(this.value))
        ret.has(m[1]) || (ret=ret.add(m[0]));
    return ret.sort();
};
Spec.prototype.version = function () { return this.get('!') };
Spec.prototype.op = function () { return this.get('.') };
Spec.prototype.type = function () { return this.get('/') };
Spec.prototype.id = function () { return this.get('#') };
Spec.prototype.source = function () { return this.token('!').ext };

Spec.prototype.sort = function () {
    function Q (a, b) {
        var qa = a.charAt(0), qb = b.charAt(0), q = Spec.quants;
        return (q.indexOf(qa) - q.indexOf(qb)) || (a<b);
    }
    var split = this.value.match(Spec.reQTokExt);
    return new Spec(split?split.sort(Q).join(''):'');
};
/** mutates */
Spec.prototype.add = function (spec,quant) {
    if (spec.constructor!==Spec)
        spec = new Spec(spec,quant);
    return new Spec(this.value+spec.value);
};
Spec.prototype.toString = function () { return this.value };


Spec.int2base = function (i,padlen) {
    var ret = '', togo=padlen||5;
    for (; i||(togo>0); i>>=6, togo--)
        ret = Spec.base64.charAt(i&63) + ret;
    return ret;
};

Spec.base2int = function (base) {
    var ret = 0, l = base.match(Spec.re64l);
    for (var shift=0; l.length; shift+=6)
        ret += Spec.base64.indexOf(l.pop()) << shift;
    return ret;
};
Spec.parseToken = function (token_body) {
    Spec.reTokExt.lastIndex = -1;
    var m = Spec.reTokExt.exec(token_body);
    if (!m) return null;

    return { bare: m[1], ext: m[2] || 'swarm' };
};

Spec.base64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';
Spec.rT = '[0-9A-Za-z_~]+';
Spec.re64l = new RegExp('[0-9A-Za-z_~]','g');
Spec.quants = ['/','#','!','.'];
Spec.reTokExt = new RegExp('^(=)(?:\\+(=))?$'.replace(/=/g,Spec.rT));
Spec.reQTokExt = new RegExp('([/#\\.!\\*])((=)(?:\\+(=))?)'.replace(/=/g,Spec.rT),'g');
Spec.is = function (str) {
    if (str===null || str===undefined) return false;
    return str.constructor===Spec || ''===str.toString().replace(Spec.reQTokExt,'');
};
Spec.as = function (spec) {
    if (!spec) {
        return new Spec('');
    } else {
        return spec.constructor === Spec ? spec : new Spec(spec);
    }
};

Spec.Map = function VersionVectorAsAMap (vec) {
    this.map = {};
    vec && this.add(vec);
};
Spec.Map.prototype.add = function (versionVector) {
    var vec=new Spec(versionVector,'!'), tok;
    while (tok=vec.token('!')) {
        var time = tok.bare, source = tok.ext||'swarm';
        if (time > (this.map[source]||''))
            this.map[source] = time;
    }
};
Spec.Map.prototype.covers = function (version) {
    Spec.reQTokExt.lastIndex = 0;
    var m = Spec.reTokExt.exec(version);
    var ts = m[1], src = m[2] || 'swarm';
    return ts <= (this.map[src]||'');
};
Spec.Map.prototype.maxTs = function () {
    var ts = null,
        map = this.map;
    for(var src in map) {
        if (!ts || ts < map[src]) {
            ts = map[src];
        }
    }
    return ts;
};
Spec.Map.prototype.toString = function (trim) {
    trim = trim || {top:10,rot:'0'};
    var top = trim.top || 10, rot = '!' + (trim.rot||'0');
    var ret = [], map = this.map;
    for(var src in map) {
        ret.push('!'+map[src]+(src==='swarm'?'':'+'+src));
    }
    ret.sort().reverse();
    while (ret.length>top || ret[ret.length-1]<=rot)
        ret.pop();
    return ret.join('')||'!0';
};

/** Syncable: an oplog-synchronized object */
var Syncable = Swarm.Syncable = function Syncable () {
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
    this._host = (args.length && args[args.length-1].constructor===Host) ?
        args.pop() : Swarm.localhost;
    if (Spec.is(args[0])) {
        this._id = new Spec(args.shift()).id() || this._host.time();
    }else if (typeof(args[0])==='string') {
        this._id = args.shift(); // TODO format
    } else {
        this._id=this._host.time();
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
var noop = function() { /* noop */ };


/** All CRDT model classes must extend syncable directly or indirectly. Syncable
  * provides all the necessary oplog- and state-related primitives and methods.
  * Every state-mutating method should be explicitly declared to be wrapped
  * by extend() (see 'ops', 'neutrals', 'remotes' sections in class declaration).
  */
Syncable.extend = function (fn, own) {
    var parent = this;
    if (fn.constructor!==Function) {
        var id = fn.toString();
        fn = function SomeSyncable(){
            this.reset(); // FIXME repeated initialization
            return parent.apply(this, arguments);
        };
        fn.id = fn.name = id; // if only it worked
    } else // please call Syncable.constructor.apply(this,args) in your constructor
        fn.id = fn.name;

    // inheritance trick from backbone.js
    var SyncProto = function () {
        this.constructor = fn;
        this._neutral = {};
        this._op = {};
        var event,
            name;
        if (parent._pt) {
            //copy _neutral & _op from parent
            for (event in parent._pt._neutral) {
                this._neutral[event] = parent._pt._neutral[event];
            }
            for (event in parent._pt._op) {
                this._op[event] = parent._pt._op[event];
            }
        }

        // "Methods" are serialized, logged and delivered to replicas
        for (name in own.ops||{}) {
            if (!Syncable.reMethodName.test(name)) continue;
            this._op[name] = own.ops[name];
            this[name] = wrapCall(name);
        }

        // "Neutrals" don't change the state
        for (name in own.neutrals||{}) {
            if (!Syncable.reMethodName.test(name)) continue;
            this._neutral[name] = own.neutrals[name];
            this[name] = wrapCall(name);
        }

        // "Remotes" are serialized and sent upstream (like RPC calls)
        for (name in own.remotes||{}) {
            if (!Syncable.reMethodName.test(name)) continue;
            this[name] = wrapCall(name);
        }

        for (name in own) {
            if (!Syncable.reMethodName.test(name) ||
                    own[name].constructor!==Function) continue;
            this[name] = own[name];
        }
        this._super = parent.prototype;
        this._type = fn.id;
        this._reactions = {};
    };

    SyncProto.prototype = parent.prototype;
    fn.prototype = new SyncProto();
    fn._pt = fn.prototype; // just a shortcut

    // default field values
    var defs = fn.defaults = own.defaults || {};
    for(var k in defs) {
        if (defs[k].constructor===Function) {
            defs[k] = {type:defs[k]};
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
    Syncable.types[fn.id] = fn;
    return fn;
};

// A *reaction* is a hybrid of a listener and a method. It "reacts" on a
// certain event for all objects of that type. The callback gets invoked
// as a method, i.e. this===syncableObj. In an event-oriented architecture
// reactions are rather handy, e.g. for creating mixins.
Syncable.addReaction = function (op, fn) {
    var reactions = this.prototype._reactions;
    var list = reactions[op];
    list || (list = reactions[op] = []);
    list.push(fn);
    return {op: op, fn: fn};
};

Syncable.removeReaction = function (handle) {
    var op = handle.op,
        fn = handle.fn,
        list = this.prototype._reactions[op],
        i = list.indexOf(fn);
    if (i===-1) throw new Error('reaction unknown');
    list[i] = undefined; // such a peculiar pattern not to mess up out-of-callback removal
    while (list.length && !list[list.length-1]) list.pop();
};


// Syncable includes all the oplog, change propagation and distributed
// garbage collection logix.
Syncable.extend(Syncable,{  // :P
    spec: function () { return new Spec('/'+this._type+'#'+this._id); },

    newEventSpec: function (op) {
        return this.spec().add(this._host.time(),'!').add(op,'.');
    },
    
    stateSpec: function () {
        return this.spec() + (this._version||''); //?
    },

    // applies a serialized operation (or a batch thereof) to this replica
    deliver: function (spec,value,lstn) {
        spec = Spec.as(spec);
        var opver = '!'+spec.version(), error=null;

        function fail (msg,ex) {
            console.error(msg,spec,value,ex.stack||ex||new Error(msg));
            if (typeof(lstn)==='function') {
                lstn(spec.set('.fail'),msg);
            } else if (lstn && typeof(lstn.error)==='function') {
                lstn.error(spec,msg);
            } else { } // no callback provided
        }
        
        // sanity checks
        if (spec.pattern()!=='/#!.') {
            return fail ('malformed spec',spec);
        } else if (!this._id) {
            return fail('undead object invoked');
        } else if (error=this.validate(spec,value)) {
            return fail('invalid input, '+error,value);
        } else if (!this.acl(spec,value,lstn)) {
            return fail('access violation',spec);
        }

        Swarm.debug && this.log(spec,value,lstn);
        
        try{
            var call = spec.op();
            if (this._op[call]) {  // FIXME name=>impl table
                if (this.isReplay(spec)) return; // it happens
                // invoke the implementation
                this._op[call].call(this, spec, value, lstn); // NOTE: no return value
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
            } else if (this._neutral[call]) {
                // invoke the implementation
                this._neutral[call].call(this, spec, value, lstn);
                // and relay to listeners
                this.emit(spec,value,lstn);
            } else {
                this.unimplemented(spec,value,lstn);
            }
        } catch(ex) { // log and rethrow; don't relay further; don't log
            return fail("method execution failed",ex);
        }

        // to force async signatures we eat the returned value silently
        return spec;
    },

    // Notify all the listeners of a state change (i.e. the operation applied).
    emit: function (spec,value,source) {
        var ls = this._lstn,
            op = spec.op(),
            is_neutral = !!this._neutral[op];
        //this._lstn = []; // cycle protection
        if (ls && ls.length) {
            for (var i = 0; i < ls.length; i++) {
                var l = ls[i];
                if (l && l !== source && l !== ',' && (!is_neutral || l.op === op)) {
                    try {// skip empties, deferreds and the source
                        l.deliver(spec, value, this);
                    } catch (ex) {
                        console.error(ex.message, ex.stack);
                    }
                }
            }
        }
        var r = this._reactions[spec.op()];
        if (r) {
            r.constructor!==Array && (r = [r]);
            for(i = 0; i < r.length; i++) {
                r[i] && r[i].call(this,spec,value,source);
            }
        }
        //if (this._lstn.length)
        //    throw new Error('Speedy Gonzales at last');
        //this._lstn = ls; // cycle protection off
    },

    trigger: function (event, params) {
        var spec = this.newEventSpec(event);
        this.deliver(spec,params);
    },

    // Blindly applies a JSON changeset to this model.
    apply: function (values) {
        for(var key in values) {
            if (key.charAt(0)==='_') continue;
            var def = this.constructor.defaults[key];
            this[key] = def&&def.type ? new def.type(values[key]) : values[key];
        }
    },
    // the version vector for this object
    version: function () {
        // distillLog() may drop some operations; still, those need to be counted
        // in the version vector; so, their Lamport ids must be saved in this._vector
        var map = new Spec.Map(this._version+(this._vector||''));
        if (this._oplog) for(var op in this._oplog) map.add(op);
        return map; // TODO return the object, let the consumer trim it to taste
    },

    // Produce the entire state or probably the necessary difference
    // to synchronize a replica which is at version *base*.
    //
    // The size of a Model's distilled log is capped by the number of
    // fields in an object. In practice, that is a small number, so
    // Model uses its distilled log to transfer state (no snapshots).
    diff: function (base) {
        //var vid = new Spec(this._version).get('!'); // first !token
        //var spec = vid + '.patch';
        var patch;
        var map = new Spec.Map(base||'');
        for(spec in this._oplog) {
            if (!map.covers(new Spec(spec).version())) {
                patch = patch || { _tail: {} };
                patch._tail[spec] = this._oplog[spec];
            }
        }
        if (this._version=='!0' && base=='!0') {
            patch = {_version:'!0'};
        }
        return patch;
    },

    // whether the update source (author) has all the rights necessary
    acl: function (spec,val,src) {
        return true;
    },
    // Check operation format/validity (recommendation: don't check against the current state)
    // Return '' if OK, error message otherwise.
    validate: function (spec,val,src) {
        // TODO add causal stability violation check  Swarm.EPOCH  (+tests)
        return '';
    },
    // whether this op was already applied in the past
    isReplay: function (spec) {
        if (!this._version) return false;
        var opver = spec.version();
        if (opver>this._version.substr(1)) return false;
        if (spec.filter('!.').toString() in this._oplog) return true; // TODO log trimming, vvectors?
        return this.version().covers(opver); // heavyweight
    },
    // External objects (those you create by supplying an id) need first to query
    // the uplink for their state. Before the state arrives they are stateless.
    hasState: function() {
        return !!this._version;
    },
    
    reset: function () {
        for(var fn=this.constructor; fn!==Syncable; fn=fn._super) {
            for(var name in fn.defaults) {
                var dv = fn.defaults[name];
                this[name] = dv.constructor===Object ? new dv.type(dv.value) : dv;
            }
        }
    },
    
    neutrals: {
        // Subscribe to the object's operations;
        // the upstream part of the two-way subscription
        //  on() with a full filter:
        //    /Mouse#Mickey!now.on   !since.event   callback
        on: function (spec,filter,repl) {   // WELL  on() is not an op, right?
            // if no listener is supplied then the object is only
            // guaranteed to exist till the next Swarm.gc() run
            if (!repl) return;
            // stateless objects fire no events; essentially, on() is deferred
            if (!this._version) {
                this._lstn.push( {
                    $pendingdl$: [spec,filter,repl],
                    deliver: function () {}
                }); // defer this call (see patch())
                return;
            }
            // make all listeners uniform objects
            if (repl.constructor===Function) {
                repl = {
                    sink: repl,
                    that: this,
                    deliver: function () { // .deliver is invoked on an event
                        this.sink.apply(this.that,arguments);
                    }
                };
            }

            filter = new Spec(filter||'','.');
            var baseVersion = filter.filter('!'),
                filter_by_op = filter.get('.');

            if (filter_by_op==='init' && this._version) {
                repl.deliver (spec.set('.init'), this, this);
                // use once()
            }
            if (filter_by_op) {
                repl = {
                    sink: repl,
                    op: filter_by_op,
                    deliver: function (spec,val,lstn) {
                        if (spec.op() === filter_by_op) {
                            this.sink.deliver(spec,val,lstn);
                        }
                    }
                };
            }

            if (baseVersion) {
                var diff = this.diff(baseVersion);
                diff && repl.deliver(spec.set('.patch'), diff, this);
                repl.deliver (spec.set('.reon'), this.version().toString(), this);
            }
            
            this._lstn.push(repl);
            // TODO repeated subscriptions: send a diff, otherwise ignore
        },
        
        // downstream reciprocal subscription
        reon: function (spec,base,repl) {
            if (!repl) throw new Error('whom?');
            var ls=this._lstn, deferreds = [], dfrd, diff;
            
            for(var i=0; i<ls.length&&ls[i]!==','; i++) {
                if (ls[i] && ls[i].$pending_ul$===repl) break;
                if (repl._host && ls[i] && ls[i].$pending_ul$===repl._host) break; // direct
            }

            if (ls[i]===',') {
                repl.deliver(spec.set('.error'),'source unknown',this);
                return;
            }

            ls[i] = repl; 

            if (base && (diff=this.diff(base))) {
                repl.deliver(spec.set('.patch'),diff,this);
            }

        },

        // Unsubscribe
        off: function (spec,val,repl) {
            var ls = this._lstn;
            var i = ls.indexOf(repl); // fast path
            if (i===-1) {
                for(i = 0; i < ls.length; i++) {
                    var l = ls[i];
                    if (l && l._wrapper && l.deliver===repl.deliver) { break; }
                    if (l && l.constructor===Array && l[2]===repl) { break; }
                }
            }
            if (i < ls.length) {
                ls[i] = undefined;
            } else {
                console.warn('listener', repl&&repl._id, 'is unknown to', this._id);
            }
            while (ls.length > 1 && !ls[ls.length - 1]) ls.pop();
        },
        
        reoff: function (spec,val,repl) {
            if (this._lstn[0] === repl) {
                this._lstn[0] = undefined; // may be shifted
                if (this._id) { this.checkUplink(); }
            }
            //TODO don't need to throw new Error('reoff: uplink mismatch');
        },

        // As all the event/operation processing is asynchronous, we
        // cannot simply throw/catch exceptions over the network.
        // This method allows to send errors back asynchronously.
        // Sort of an asynchronous complaint mailbox :)
        error: function (spec,val,repl) {
            console.error('something failed:',spec,val,'@',(repl&&repl._id));
        },

    }, // neutrals

    ops: {
        // A state of a Syncable CRDT object is transferred to a replica using
        // some combination of POJO state and oplog. For example, a simple LWW
        // object (Last Writer Wins, see Model below) uses its distilled oplog
        // as the most concise form. A CT document (Causal Trees) has a highly
        // compressed state, its log being hundred times heavier. Hence, it
        // mainly uses its plain state, but sometimes its log tail as well. The
        // format of the state object is POJO plus (optionally) special fields:
        // _oplog, _tail, _vector, _version (the latter flags POJO presence).
        // In either case, .state is only produced by diff() (+ by storage).
        // Any real-time changes are transferred as individual events.
        patch: function (spec, state, src) {

            var tail = {}; // ops to be applied on top of the received state
            var typeid=spec.filter('/#');
            var lstn = this._lstn;
            this._lstn = []; // prevent events from being fired

            if (state._version==='!0') { // uplink knows nothing
                if (!this._version) this._version = '!0';
            }

            if (state._version && state._version!=='!0') {
                // local changes may need to be merged into the received state
                if (this._oplog) {
                    for(var spec in this._oplog) tail[spec] = this._oplog[spec];
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
            if (state._tail) for(var s in state._tail) tail[s] = state._tail[s];
            // appply the combined tail to the new state
            var specs = [];
            for(var spec in tail) specs.push(spec);
            specs.sort().reverse();
            // there will be some replays, but those wil be ignored
            while (sp = specs.pop()) this.deliver(typeid+sp,tail[sp],lstn);

            // do deferred diff responses and reciprocal subscriptions
            var ls = this._lstn, pending = [], args;
            this._lstn = lstn.filter(function(ln){
                return !(ln && ln.$pendingdl$ && pending.push(ln.$pendingdl$));
            });
            // process deferred on()s
            while (args = pending.pop())
                this.deliver(args[0],args[1],args[2]);
        }

    }, // ops

    // Uplink connections may be closed or reestablished so we need
    // to adjust every object's subscriptions time to time.
    checkUplink: function () {
        var needUplinks = this._host.getSources(this.spec()).slice();
        // the plan is to eliminate extra subscriptions and to
        // establish missing ones; that only affects outbound subs
        for(var i=0; i<this._lstn.length && this._lstn[i]!=','; i++) {
            var up = this._lstn[i];
            if (!up) continue;
            up.$pending_ul$ && (up = up.$pending_ul$);
            var ui=needUplinks.indexOf(up);
            if (ui===-1) { // don't need this uplink anymore
                up.deliver(this.newEventSpec('off'),'',this);
            } else {
                needUplinks[i] = undefined;
            }
        }
        for(var i=0; i<needUplinks.length; i++) { // subscribe to the new
            var ln = needUplinks[i];
            if (!ln) continue;
            this._lstn.unshift({
                $pending_ul$: ln,
                deliver: noop
            });
            ln.deliver(this.newEventSpec('on'),this.version().toString(),this);
        }
    },
    // returns a Plain Javascript Object with the state
    pojo: function (addVersionInfo) {
        var pojo = {}, defs = this.constructor.defaults;
        for(var key in this) if (this.hasOwnProperty(key)) {
            if (Model.reFieldName.test(key) && this[key]!==undefined) {
                var def = defs[key], val = this[key];
                pojo[key] = def&&def.type ? (val.toJSON&&val.toJSON()) || val.toString() :
                            (val&&val._id ? val._id : val) ; // TODO prettify
            }
        }
        if (addVersionInfo) {
            pojo._id = this._id; // not necassary
            pojo._version = this._version;
            this._vector && (pojo._vector=this._vector);
            this._oplog && (pojo._oplog=this._oplog); //TODO copy
        }
        return pojo;
    },
    // Sometimes we get an operation we don't support; not normally
    // happens for a regular replica, but still needs to be caught
    unimplemented: function (spec,val,repl) {
        console.warn("method not implemented:",spec);
    },
    // Deallocate everything, free all resources.
    close: function () {
        var l = this._lstn,
            s = this.spec(),
            uplink;

        this._id = null; // no id - no object; prevent relinking
        while ((uplink = l.shift()) && uplink !== ',') {
            uplink.off(s, null, this);
        }
        while (l.length) {
            l.pop().reoff(s, null, this);
        }
        this._host.unregister(this);
    },
    // Once an object is not listened by anyone it is perfectly safe
    // to garbage collect it.
    gc: function () {
        var l = this._lstn;
        if (!l.length || (l.length===1 && !l[0]))
            this.close();
    },
    log: function(spec,value,replica) {
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
    once: function (filter,fn) { // only takes functions; syncables don't need 'once'
        this.on(filter, function onceWrap() {
            fn.apply(this,arguments); // "this" is the object
            this.off(filter,onceWrap);
        });
    }
});


//      M O D E L   (LWW key-value object)

function Model (idOrState) {
    var ret = Model._super.apply(this, arguments);
    if (ret===this && idOrState && 
    idOrState.constructor!==String && !Spec.is(idOrState)) {
        this.set(idOrState);
    }
}

Swarm.Model = Syncable.extend(Model,{
    defaults: {
        _oplog: Object
    },
    /**  init modes:
    *    1  fresh id, fresh object
    *    2  known id, stateless object
    *    3  known id, state boot
    */
    neutrals: {
        on: function (spec,base,repl) {
            //  support the model.on('field',callback_fn) pattern
            if (typeof(repl)==='function' && 
                    typeof(base)==='string' &&
                    (base in this.constructor.defaults)) {
                var stub = {
                    fn: repl,
                    key: base,
                    self: this,
                    deliver: function (spec,val,src) {
                        if (spec.op() === 'set' && (this.key in val)) {
                            this.fn.call(this.self,spec,val,src);
                        }
                    }
                };
                repl = stub;
                base = '';
            }
            // this will delay response if we have no state yet
            Syncable._pt._neutral.on.call(this,spec,base,repl);
        },

        off: function (spec,base,repl) {
            var ls = this._lstn;
            if (typeof(repl)==='function') { // TODO ugly
                for(var i=0;i<ls.length;i++) {
                    if (ls[i].fn===repl && ls[i].key===base) {
                        repl = ls[i];
                        break;
                    }
                }
            }
            Syncable._pt._neutral.off.apply(this,arguments);
        }

        /*init: function (spec,snapshot,host) {
            if (this._version && this._version!=='0')
                return; // FIXME tail FIXME
            snapshot && this.apply(snapshot);
            Syncable._pt.__init.apply(this,arguments);
        }*/
    },

    // TODO remove unnecessary value duplication
    packState: function (state) {
    },
    unpackState: function (state) {
    },
    /** Removes redundant information from the log; as we carry a copy
     *  of the log in every replica we do everythin to obtain the minimal
     *  necessary subset of it.
     *  As a side effect, distillLog allows up to handle some partial
     *  order issues (see $$set). */
    distillLog: function () {
        // explain
        var sets = [], cumul = {}, heads = {}, spec;
        for(var s in this._oplog) {
            spec = new Spec(s);
            //if (spec.op() === 'set') {
                sets.push(spec);
            //}
        }
        sets.sort();
        for(var i=sets.length-1; i>=0; i--) {
            spec = sets[i];
            var val = this._oplog[spec], notempty = false;
            for(var key in val) {
                if (key in cumul) {
                    delete val[key];
                } else {
                    notempty = cumul[key] = true;
                }
            }
            var source = spec.source();
            notempty || (heads[source] && delete this._oplog[spec]);
            heads[source] = true;
        }
        return cumul;
    },

    ops: {
        /** This barebones Model class implements just one kind of an op:
         *  set({key:value}). To implment your own ops you need to understand
         *  implications of partial order as ops may be applied in slightly
         *  different orders at different replicas. This implementation
         *  may resort to distillLog() to linearize ops.
         * */
        set: function (spec,value,repl) {
            var version = spec.version(), vermet = spec.filter('!.').toString();
            if (version<this._version.substr(1)) {
                this._oplog[vermet] = value;
                this.distillLog(); // may amend the value
                value = this._oplog[vermet];
            }
            value && this.apply(value);
        }
    },
    
    fill: function (key) { // TODO goes to Model to support references
        if (!this.hasOwnProperty(key))
            throw new Error('no such entry');
        //if (!Spec.is(this[key]))
        //    throw new Error('not a specifier');
        var spec = new Spec(this[key]).filter('/#');
        if (spec.pattern()!=='/#')
            throw new Error('incomplete spec');
        this[key] = this._host.get(spec);
        /* TODO new this.refType(id) || new Swarm.types[type](id);
        on('init', function(){
            self.emit('fill',key,this)
            self.emit('full',key,this)
        });*/
    },
    
    save: function () {
        var cumul = this.compactLog(), changes = {}, pojo=this.pojo(), key;
        for(key in pojo) {
            if (this[key]!==cumul[key]) {// TODO nesteds
                changes[key] = this[key];
            }
        }
        for(key in cumul) {
            if (!(key in pojo)) {
                changes[key] = null; // JSON has no undefined
            }
        }
        this.set(changes);
    },

    validate: function (spec, val) {
        if (spec.op() !== 'set') return ''; // no idea
        for(var key in val)
            if (!Model.reFieldName.test(key)) return 'bad field name';
        return '';
    }

});
Model.reFieldName = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;

// Model may have reactions for field changes as well as for 'real' ops/events
// (a field change is a .set operation accepting a {field:newValue} map)
Model.addReaction = function (methodOrField, fn) {
    var proto = this.prototype;
    if (typeof (proto[methodOrField]) === 'function') { // it is a field name
        return Syncable.addReaction.call(this, methodOrField, fn);
    } else {
        var wrapper = function (spec,val) {
            if (methodOrField in val)
                fn.apply(this, arguments);
        };
        wrapper._rwrap = true;
        return Syncable.addReaction.call(this, 'set', wrapper);
    }
};


//       S E T


// Backbone's Collection is essentially an array and arrays behave poorly
// under concurrent writes (see OT). Hence, our primary collection type
// is a {id:Model} Set. One may obtain a linearized version by sorting
// them by keys or otherwise.
// This basic Set implementation can only store objects of the same type.
var Set = Swarm.Set = Syncable.extend('Set', {
    
    defaults: {
        objects: Object,
        _oplog: Object,
        _proxy: ProxyListener
    },
    
    ops: {
        // Both Model and Set are oplog-only; they never pass the state on the wire,
        // only the oplog; new replicas are booted with distilled oplog as well.
        // So, this is the only point in code that mutates the state of a Set.
        change: function (spec,value,repl) {
            value = this.distillOp(spec,value);
            for(var spec in value) {
                if (value[spec]) {
                    this.objects[spec] = this._host.get(spec);
                    this.objects[spec].on(this._proxy);
                } else if (this.objects[spec]) {
                    this.objects[spec].off(this._proxy);
                    delete this.objects[spec];
                }
            }
        }
    },
    
    neutrals: {
        on : function (spec,val,lstn) {
            // proxied member event listening
            //TODO
            Syncable._pt._neutral.on.apply(this,arguments);
        },
        off : function (spec,val,lstn) {
            //TODO
            Syncable._pt._neutral.off.apply(this,arguments);
        }
    },
    
    validate: function (spec,val,src) {
        if (spec.op() === 'change')
            for(var spec in val) // member spec validity
                if (Spec.pattern(spec)!=='/#') 
                    return 'invalid spec: '+spec;
        return '';
    },
    
    distillOp: function (spec,val) {
        if (spec.version()>this._version) return val; // no concurrent op
        var opkey = spec.filter('!.');
        this._oplog[opkey] = val;
        this.distillLog(); // may amend the value
        return this._oplog[opkey] || {};
    },
    
    distillLog: Model.prototype.distillLog,
    
    // Adds an object to the set.
    // Arguments: the object, its id or its specifier.
    addObject: function (obj) {
        var specs = {};
        specs[obj.spec()] = 1;
        this.change(specs);
    },
    // FIXME reactions to emit .add, .remove

    removeObject: function (obj) {
        var specs = {};
        specs[obj.spec()] = 0;
        this.change(specs);
    },
    
    get: function (spec) {
        spec = new Spec(spec).filter('/#');
        if (spec.pattern()!=='/#')
            throw new Error("invalid spec");
        return this.objects[spec];
    },
    
    list: function (order) {
        var ret = [];
        for(var key in this.objects)
            ret.push(this.objects[key]);
        ret.sort(order);
        return ret;
    }
});

function ProxyListener () {
    // TODO
}

/** Host is (normally) a singleton object registering/coordinating
 *  all the local Swarm objects, connecting them to appropriate
 *  external uplinks, maintaining clocks, etc.
 *  Host itself is not fully synchronized like a Model but still
 *  does some event gossiping with peer Hosts.
 *  */
function Host (id, val, storage) {
    this.objects = {};
    this.lastTs = '';
    this.tsSeq = 0;
    this.clockOffset = 0;
    this.sources = {};
    this.storage = storage;
    this._host = this; // :)
    this._lstn = [','];
    this._id = id;

    if (this.storage) {
        this.sources[this._id] = this.storage;
        this.storage._host = this;
    }
    delete this.objects[this.spec()];
}

Swarm.Host = Syncable.extend(Host,{

    deliver: function (spec,val,repl) {
        if (spec.pattern()!=='/#!.')
            throw new Error('incomplete event spec');
        if (spec.type()!=='Host') {
            var typeid = spec.filter('/#');
            var obj = this.get(typeid);
            obj && obj.deliver(spec,val,repl);
        } else
            this._super.deliver.apply(this,arguments);
    },

    init: function (spec,val,repl) {

    },

    get: function (spec) {
        if (spec&&spec.constructor===Function&&spec.id)
            spec = '/'+spec.id;
        spec = new Spec(spec);
        var typeid = spec.filter('/#');
        if (!typeid.has('/'))
            throw new Error('invalid spec');
        var o = typeid.has('#') && this.objects[typeid];
        if (!o) {
            var t = Syncable.types[spec.type()];
            if (!t) throw new Error('type unknown: '+spec);
            o = new t(typeid,undefined,this);
        }
        return o;
    },

    addSource: function hostAddPeer (spec,peer) {
        if (false) { // their time is off so tell them so  //FIXME ???
            this.clockOffset;
        }
        var old = this.sources[peer._id];
        old && old.deliver(this.newEventSpec('off'),'',this);

        this.sources[peer._id] = peer;
        if (spec.op() === 'on')
            peer.deliver(this.newEventSpec('reon'),'',this); // TODO offset

        for(var sp in this.objects) {
            this.objects[sp].checkUplink();
        }

        this.emit(spec,'',peer); // PEX hook
    },

    neutrals: {
        // Host forwards on() calls to local objects to support some
        // shortcut notations, like
        //          host.on('/Mouse',callback)
        //          host.on('/Mouse.init',callback)
        //          host.on('/Mouse#Mickey',callback)
        //          host.on('/Mouse#Mickey.init',callback)
        //          host.on('/Mouse#Mickey!baseVersion',repl)
        //          host.on('/Mouse#Mickey!base.x',trackfn)
        // The target object may not exist beforehand.
        // Note that the specifier is actually the second 3sig parameter
        // (value). The 1st (spec) reflects this /Host.on invocation only.
        on: function hostOn (spec,evfilter,lstn) {
            if (!evfilter) // the subscriber needs "all the events"
                return this.addSource(spec,lstn);

            if (evfilter.constructor===Function && evfilter.id) evfilter=evfilter.id;

            var objon = new Spec(evfilter,'/').filter('/#');
            if (!objon.has('/'))
                throw new Error('no type mentioned');

            if (objon.type() === 'Host') {
                this._super._neutral.on.call(this, spec, evfilter, lstn);
            } else {
                objon.has('#') || (objon=objon.add(spec.version(),'#'));
                objon=objon.add(spec.version(),'!').add('.on').sort();
                this.deliver(objon, evfilter, lstn);

                // We don't do this as the object may have no state now.
                // return o;
                // Instead, use host.on('/Type#id.init', function(,,o) {})
            }
        },

        reon: function hostReOn (spec,ts,host) {
            if (spec.type()!=='Host') throw 'think';
            /// well.... TODO
            this.addSource(spec,host);
        },

        off: function (spec,nothing,peer) {
            var obj;
            if (spec.type()!=='Host') { // host.off('/Type#id') shortcut
                var typeid = spec.filter('/#');
                obj = this.objects[typeid];
                if (obj) {
                    obj.off(spec,clocks,peer);
                }
                return;
            }
            if (this.sources[peer._id]!==peer) {
                //throw new Error
                console.error('peer unknown', peer._id);
                return;
            }
            if (this._id !== peer._id) { // skip if peer ~ storage
                delete this.sources[peer._id];
            }
            for (var sp in this.objects) {
                obj = this.objects[sp];
                if (obj._lstn && obj._lstn.indexOf(peer)!==-1) {
                    obj.off(sp,'',peer);
                    this.checkUplink(sp);
                }
            }
            if (spec.op() === 'off') {
                peer.deliver(this.newEventSpec('reoff'),'',this);
            }
        },

        reoff: function hostReOff (spec,ts,host) {
        }

    }, // neutrals

    // Returns an unique Lamport timestamp on every invocation.
    // Swarm employs 30bit integer Unix-like timestamps starting epoch at
    // 1 Jan 2010. Timestamps are encoded as 5-char base64 tokens; in case
    // several events are generated by the same process at the same second
    // then sequence number is added so a timestamp may be more than 5
    // chars. The id of the Host (+user~session) is appended to the ts.
    time: function () {
        var d = new Date().getTime() - Host.EPOCH + (this.clockOffset || 0),
            ts = Spec.int2base((d / 1000) | 0, 5),
            res = ts;
        if (ts === this.lastTs) {
            res += Spec.int2base(++this.tsSeq, 2); // max ~4000Hz
        } else {
            this.tsSeq = 0;
        }
        res += '+' + this._id;
        this.lastTs = ts;
        this._version = '!' + res;
        return res;
    },

    // Returns an array of sources (caches,storages,uplinks,peers)
    // a given replica should be subscribed to. This default
    // implementation uses a simple consistent hashing scheme.
    // Note that a client may be connected to many servers
    // (peers), so the uplink selection logic is shared.
    getSources: function (spec) {
        var self = this,
            uplinks = [],
            mindist = 4294967295,
            rePeer = /^swarm~/, // peers, not clients
            target = Swarm.hash(spec),
            closestPeer = null;

        if (rePeer.test(this._id)) {
            mindist = Swarm.hashDistance(this._id, target);
            closestPeer = this.storage;
        } else {
            uplinks.push(self.storage); // client-side cache
        }

        for(var id in this.sources) {
            if (!rePeer.test(id)) continue;
            var dist = Swarm.hashDistance(id, target);
            if (dist < mindist) {
                closestPeer = this.sources[id];
                mindist = dist;
            }
        }
        closestPeer && uplinks.push(closestPeer);

        return uplinks;
    },

    register: function (obj) {
        var spec = obj.spec();
        if (spec in this.objects)
            return this.objects[spec];
        this.objects[spec] = obj;
        return obj;
    },

    unregister: function (obj) {
        var spec = obj.spec();
        // TODO unsubscribe from the uplink - swarm-scale gc
        (spec in this.objects) && delete this.objects[spec];
    },

    // initiate 2-way subscription (normally to a remote host)
    connect: function (peer) {
        peer.deliver(this.newEventSpec('.on'),'',this);
    },

    checkUplink: function (spec) {
        //  TBD Host event relay + PEX
    }
});

Host.MAX_INT = 9007199254740992;
Host.EPOCH = 1262275200000; // 1 Jan 2010 (milliseconds)
Host.MAX_SYNC_TIME = 60*60000; // 1 hour (milliseconds)
Swarm.HASH_POINTS = 3;

Swarm.hash = function djb2Hash (str) {
    var hash = 5381;
    for(var i=0; i<str.length; i++)
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    return hash;
};

Swarm.hashDistance = function hashDistance (peer,obj) {
    if ((obj).constructor!==Number) {
        if (obj._id) obj=obj._id;
        obj = Swarm.hash(obj);
    }
    if (peer._id) peer = peer._id;
    var dist = 4294967295;
    for(var i=0; i<Swarm.HASH_POINTS; i++) {
        var hash = Swarm.hash (peer._id + ':' + i);
        dist = Math.min(dist,hash^obj);
    }
    return dist;
};

Swarm.STUB = {
    deliver:function(){},
    on:function(){},
    off:function(){}
};

/**
 * A "pipe" is a channel to a remote Swarm Host. Pipe's interface
 * mocks a Host except all calls are serialized and sent to the
 * *stream*; any arriving data is parsed and delivered to the
 * local host. The *stream* must support an interface of write(),
 * end() and on('open'|'data'|'close'|'error',fn).  Instead of a
 * *stream*, the caller may supply an *uri*, so the Pipe will
 * create a stream and connect/reconnect as necessary.
 */
function Pipe (host, stream, opts) {
    var self = this;
    self.opts = opts || {};
    if (!stream || !host) 
        throw new Error('new Pipe(host,stream[,opts])');

    self._id = null;
    self.host = host;
    this.isClient = undefined;
    self.serializer = self.opts.serializer || JSON;
    self.katimer = null;
    self.lastSendTS = self.lastRecvTS = self.time();
    self.bundle = {};
    // don't send immediately, delay to bundle more messages
    self.delay = self.opts.delay || -1;
    //self.reconnectDelay = self.opts.reconnectDelay || 1000;
    if (typeof(stream.write)!=='function') { // TODO nicer
        var url = stream.toString();
        var m = url.match(/(\w+):.*/);
        if (!m) throw new Error('invalid url '+url);
        var proto = m[1].toLowerCase();
        var fn = Pipe.streams[proto];
        if (!fn) throw new Error('protocol not supported: '+proto);
        self.url = url;
        stream = new fn(url);
    }
    self.connect(stream);
}
Swarm.Pipe = Pipe;
Pipe.streams = {};
Pipe.TIMEOUT = 60000; //ms

Pipe.prototype.connect = function pc (stream) {
    var self = this;
    self.stream = stream;

    self.stream.on('data', function onMsg(data) {
        data = data.toString();
        if (Swarm.debug) console.log(self.host._id,'received from',self._id,data);
        self.lastRecvTS = self.time();
        var json = self.serializer.parse(data);
        try {
            self._id ? self.parseBundle(json) : self.parseHandshake(json);
        } catch (ex) {
            // TODO
        }
        self.reconnectDelay = self.opts.reconnectDelay || 1000;
    });

    self.stream.on('close', function onConnectionClosed(reason) {
        if (Swarm.debug) console.log('sink closed'); 
        self.stream = null; // needs no further attention
        self.close("stream closed");
    });

    self.stream.on('error', function(err) {
        self.close('stream error: '+err);
    });

    self.katimer = setInterval(function() {
        var now = self.time(),
            sinceRecv = now - this.lastRecvTS,
            sinceSend = now - this.lastSendTS;
        if (sinceSend > Pipe.TIMEOUT/2) this.sendBundle();
        if (sinceRecv > Pipe.TIMEOUT) this.close("stream timeout");
    }, (Pipe.TIMEOUT/4+Math.random()*100)|0 );

    // NOPE client only finally, initiate handshake
    // self.host.connect(self);

};

Pipe.prototype.parseHandshake = function ph (handshake) {
    var spec, value, key;
    for (key in handshake) {
        spec = new Spec(key);
        value = handshake[key];
        break; // 8)-
    }
    if (!spec)
        throw new Error('handshake has no spec');
    if (spec.id()===this.host._id)
        throw new Error('self hs');
    this._id = spec.id();
    var op = spec.op();
    var evspec = spec.set(this.host._id,'#');
    
    if (op in {'on':1,'reon':1,'off':1,'reoff':1}) {// access denied TODO
        this.host.deliver(evspec,value,this);
    } else {
        throw new Error('invalid handshake');
    }
};

/** close everything; note: may be invoked multiple times */
Pipe.prototype.close = function pc (error) {
    if (Swarm.debug) console.log('pipe closed', this._id, error);
    if (error && this.host && this.url) {
        var _url = this.url, _host = this.host, _opts = this.opts;
        var reconnectDelay = Math.min(30000, self.reconnectDelay<<1); // TODO
        // schedule a retry
        setTimeout(function () {
            _host.connect(new Pipe(_host,_url,_opts));
        }, 5000); // TODO reconnectDelay);
        this.url = null;
    }
    if (this.host) {
        if (this.isClient!==undefined) { // emulate normal off
            var offspec = this.host.newEventSpec(this.isClient?'off':'reoff');
            this.host.deliver(offspec,'',this);
        }
        this.host = null; // can't pass any more messages
    }
    if (this.katimer) {
        clearInterval(this.katimer);
        this.katimer = null;
    }
    if (this.stream) {
        try {
            this.stream.close();
        } catch(ex) {}
        this.stream = null;
    } 
    this._id = null;
};

Pipe.prototype.deliver = function pd (spec, val, src) {
    var self = this;
    val && val.constructor===Spec && (val=val.toString());
    if (spec.type()==='Host') {
        if (spec.op() in {off: 1, reoff: 1}) {// grace period
            this.isClient = undefined;
            setTimeout(function(){self._id&&self.close()},1000);
            if (!this.stream) return; // no need to send
        } else if (spec.op() in {on: 1, reon: 1}) {
            this.isClient = (spec.op()==='on');
        }
    }
    self.bundle[spec] = val; // TODO aggregation
    if (self.delay === -1) {
        self.sendBundle();
        return;
    }
    var now = this.time(), gap = now-self.lastSendTS;
    self.timer = self.timer || setTimeout(function(){
        self.sendBundle();
        self.timer = null;
    }, gap>self.delay ? self.delay : self.delay-gap ); /// hmmm
};

// milliseconds as an int
Pipe.prototype.time = function () { return new Date().getTime(); };
Pipe.prototype.spec = function () { 
    return this._id ? new Spec('/Host#'+this._id) : '';
};

Pipe.prototype.parseBundle = function pb (bundle) {
    var spec_list = [], spec;
    //parse specifiers
    for(var key in bundle) key && spec_list.push(new Spec(key));
    spec_list.sort().reverse();
    while (spec = spec_list.pop()) {
        this.host.deliver(spec, bundle[spec], this);
    }
};

Pipe.prototype.sendBundle = function pS () {
    var self = this;
    var sendStr = self.serializer.stringify(self.bundle);
    self.bundle = {};
    if (!self.stream) 
        return; //throw new Error('no stream');

    try {
        if (Swarm.debug) { console.log('goes to', (self._id || 'undefined'), sendStr); }
        self.stream.write(sendStr);
        self.lastSendTS = self.time();
    } catch (ex) {
        console.error('stream error: '+ex,ex.stack);
        if (self._id) self.close('stream error');
    }
};

