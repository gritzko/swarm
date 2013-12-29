var Swarm = {};

function Spec (str) {
    // str is spec or an array
    this.value = str.toString().match(Spec.reQTokExt) || [];
    this.sort();
}
Spec.prototype.filter = function (quants) {
    function hitf(match)
        { return quants.indexOf(match.charAt(0))!==-1 ? match : '' }
    return new Spec (this.value.filter(hitf));
};
Spec.prototype.pattern = function () {
    for(var ret='', i=0; i<this.value.length; i++) ret+=this.value[i].charAt(0);
    return ret;
};
Spec.pattern = function (str) {
    return str.replace(Spec.reQTokExt,'$1');
};
Spec.prototype.get = function (quant) {
    for(var i=0; i<this.value.length; i++)
        if (this.value[i].charAt(0)===quant)
            return this.value[i];
    return '';
};
Spec.prototype.has = function (quant) {
    for(var i=0; i<this.value.length; i++)
        if (this.value[i].charAt(0)===quant)
            return true;
    return false;
};
Spec.prototype.version = function () { return this.get('!').substr(1) };
Spec.prototype.method = function () { return this.get('.').substr(1) };
Spec.prototype.type = function () { return this.get('/').substr(1) };
Spec.prototype.id = function () { return this.get('#').substr(1) };

Spec.prototype.sort = function () {
    var q = Spec.quants;
    this.value.sort(function (a, b) {
        return q.indexOf(a.charAt(0)) - q.indexOf(b.charAt(0));
    });
};
/** mutates */
Spec.prototype.add = function (quant,tok) {
    if (quant.length===1) {
        this.value.push(quant+tok);
    } else if (Spec.is(quant))
        this.value = this.value.concat(quant.toString().match(Spec.reQTokExt));
};
Spec.prototype.change = function (quant,tok) {
    return this.filter(quant,true).add(quant+tok);
};
Spec.prototype.toString = function () { return this.value.join('') };

Spec.bare = function (tok) {
    var i=tok.indexOf('+');
    return i===-1 ? '' : tok.substr(0,i);
};
Spec.ext = function (tok) {
    var i=tok.indexOf('+');
    return i===-1 ? '' : tok.substr(i+1);
};


Spec.int2base = function (i,padlen) {
    var ret = '', togo=padlen||5;
    for (; i||togo>0; i>>=6, togo--)
        ret = Spec.base64.charAt(i&63) + ret;
    return ret;
};

Spec.base2int = function (base) {
    var ret = 0, l = base.match(Spec.re64l);
    for (var shift=0; l.length; shift+=6)
        ret += Spec.base64.indexOf(l.pop()) << shift;
    return ret;
};

Spec.base64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';
Spec.rT = '[0-9A-Za-z_~]+';
Spec.re64l = new RegExp('[0-9A-Za-z_~]','g');
Spec.quants = ['/','#','!','.'];
Spec.reTokExt = new RegExp('^(=)(?:\\+(=))?$'.replace(/=/g,Spec.rT));
Spec.reQTokExt = new RegExp('([/#\\.!\\*])((=)(?:\\+(=))?)'.replace(/=/g,Spec.rT),'g');
Spec.is = function (str) {
    return str && (str.constructor===Spec || ''===str.toString().replace(Spec.reQTokExt,''));
};

Spec.Map = function VersionMap (vec) {
    this.map = {};
    var m=[];
    vec && this.add(vec);
};
Spec.Map.prototype.add = function (src,ts) {
    var m = [];
    Spec.reQTokExt.lastIndex = 0;
    while (m=Spec.reQTokExt.exec(src)) {
        var ts = m[3], src = m[4];
        if (ts > (this.map[src]||''))
            this.map[src] = ts;
    }
};
Spec.Map.prototype.covers = function (version) {
    Spec.reQTokExt.lastIndex = 0;
    var m = Spec.reQTokExt.exec(version);
    var ts = m[3], src = m[4];
    return ts <= (this.map[src]||'');
};
Spec.Map.prototype.toString = function () {
    var ret = [], map = this.map;
    for(var src in map)
        ret.push('!'+map[src]+'+'+src);
    return ret.sort().join('');
};

/** Syncable object modified by ops */
var Syncable = Swarm.Syncable = function Syncable () {
};

Syncable.types = {};

// wrap the operation's code with signature normalization
Syncable.sigwrap = function sigwrap (proto,acname,alias) {
    var m = acname.match(Syncable.re_acname);
    var receivable = (m[1]==='$'), emittable = (m[2]==='$'), name = m[3];
    proto[name] = function() {
        this.normalizeSignature(arguments,name);
        var spec=arguments[0], value=arguments[1], replica=arguments[2];
        Swarm.debug && this.log(spec,value,replica);
        if (!this._id)
            throw new Error('undead object invoked');
        var ret = this[acname](spec,value,replica);
        emittable && this.__emit(spec,value,replica);
        // FIXME separate state-changing vs ip ops
        if (!(name in Syncable.PRESTATE) && name!=='reon' && name!=='reoff') {
            var verop = spec.filter('!.');
            verop && this._oplog && (this._oplog[verop] = value);
            var opver = spec.version();
            this._version = (opver>this._version) ? opver : this._version+'!'+opver;
            // FIXME proper !v!v syntax?
        }
        return ret || this; // ?
    }
}
Syncable.re_acname = /^([$_])([$_])(\w+)$/;
Syncable._default = {};


/**  All state-changing methods of a syncable class must be...
  *  $$operation
  *  $_no-emit-operation
  *  _$rpcCall  
  *  __sig3Method
  *  plainMethod()
  */
Syncable.extend = function(fn,own) {
    if (typeof(fn)!=='function') {
        if (typeof(fn)!=='string')
            throw new Error('1st argument: constructor or class name');
        var id = fn;
        // synthetic constructor; TODO  Backbone extend() snippet for proto chain
        fn = Syncable.types[id] = function SomeSyncable (id,state,host) {
            for(var key in this._default) {
                var def = this._default[key];
                this[key] = def&&def.constructor===Function ? new def() : def; // TODO values
            }
            this._host = host || Swarm.localhost;
            var version = this._host.version();
            this._id = (Spec.is(id) ? new Spec(id).id() : id) || version; // TODO format check
            var spec = this.spec();
            if (this._id===version)
                this._version = version;
            // Q: don't want to call init() with no state in hands BUT
            //    need to initialize descendant-specific fields
            state && this.init(spec.toString()+'!'+version+'.init',state,host);
            return this._host.register(this); // :)
        };
        fn.id = fn.name = id;
    } else
        fn.id = fn.name;
    var fnproto = fn.prototype, myproto = this.prototype;
    for (var prop in myproto) // inherit methods and fields
        fnproto[prop] = myproto[prop];
    // default field values
    var defs = fnproto._default = {};
    for (var key in myproto._default)
        defs[key] = myproto._default[key];
    if (own.default)
        for (var key in own.default)
            defs[key] = own.default[key];
    delete own.default;
    // add methods
    for (var prop in own) {// extend
        if (Syncable.re_acname.test(prop)) { // an op
            Syncable.sigwrap(fnproto,prop);
            own[prop].constructor===String && (own[prop]=own[own[prop]]); // aliases
        }
        fnproto[prop] = own[prop];
    }
    // inherit static functions
    for(var prop in this)
        if (typeof(this[prop])==='function')
            fn[prop] = this[prop];
    // finishing touches
    fnproto._super = myproto;
    fnproto._type = fn.id;
    fn._pt = fnproto; // just a shortcut
    fn.extend = this.extend;
    Syncable.types[fn.id] = fn;
    return fn;
};

// 3-parameter signature
//  * specifier (or a base64 string)
//  * value anything but a function
//  * source/callback - anything that can receive events
Syncable.prototype.normalizeSignature = function (args,method) {
    var len = args.length;
    while (len && args[len-1]===undefined) len--;
    if (len===0 || len>3)
        throw new Error('invalid number of arguments');
    // normalize replica/callback
    if (typeof(args[len-1])==='function') // model.on(callback)
        args[len-1] = {deliver:args[len-1],_isWrap:true};
    if (len<3 && args[len-1] && typeof(args[len-1].deliver)==='function') {
        args[2] = args[len-1]; // model.on(replica), model.on(key,replica)
        args[len-1] = null;
    }
    // normalize value
    if (!args[1] && !Spec.is(args[0]) && typeof(args[0])==='object') {
        args[1] = args[0]; // model.set({key:value})
        args[0] = null;    // model.on('key')
    }
    // normalize specifier; every op needs to be fully specd
    var spec = new Spec(args[0]||'');
    spec.has('/') || (spec.add('/',this._type));
    spec.has('#') || (spec.add('#',this._id));
    spec.has('!') || (spec.add('!',this._host.version()));
    spec.has('.') || (spec.add('.',method));
    spec.sort();
    args[0] = spec;
};


Syncable.extend(Syncable,{
    default : {
        _lstn: Array,
        _id: '',
        _version: ''
    },
    hasState: function () { return !!this._version },
    spec: function () { return '/'+this._type+'#'+this._id; }, 
    fullspec: function () { return '@'+this._host._id+this.spec() },
    // dispatches serialized operations back to their respective methods
    deliver: function (spec,value,lstn) {
        var pattern = spec.pattern();
        if (pattern==='/#!.') {
            if (!this._version && !(spec.method() in Syncable.PRESTATE))
                throw new Error('only prestate methods allowed');
            var method = spec.method();
            var impl = ('$$'+method in this) ? '$$'+method : '$_'+method;
            if (typeof(this[impl])==='function')
                this[method](spec,value,lstn); // this[impl] to optimize?
            else
                this.default(spec,value,lstn);
        } else if (pattern==='/#') { // unbundle
            var specs = [];
            for (var sp in value)
                Spec.pattern(sp)==='!.' && specs.push(sp);
            specs.sort().reverse();
            while (s=specs.pop())
                this.deliver(new Spec(spec.toString()+s),value[s],lstn); // TODO polish
        } else
            throw new Error('malformed spec: '+spec);
    },
    // notify all the listeners of an operation
    __emit: function (spec,value,source) {
        var ls = this._lstn;
        if (!ls || !ls.length) return;
        this._lstn = []; // cycle protection
        for(var i=0; i<ls.length; i++)
            if (ls[i] && ls[i]!=source) try {// don't relay back to the source
                ls[i].deliver(spec,value,this);
            } catch (ex) {
                console.error(ex.message,ex.stack);
            } 
        if (this._lstn.length)
            throw new Error('Speedy Gonzales at last');
        this._lstn = ls; // cycle protection off
    },
    // boot the object with some initial state
    $_init: function (spec,val,host) {
        // Init() is not emitted per se, as listeners may not need the
        // full state (as we do). Still, we do deferred diff responses
        // and reciprocal subscriptions. 
        var stubs = this._lstn || [], ls;
        this._lstn = [];
        while (ls = stubs.pop()) 
            this.$_on.apply(this,ls);
    },
    // Subscribe to the object's operations
    $_on: function (spec,val,repl) {   // WELL  on() is not an op, right?
        // if no listener is supplied then the object is only
        // guaranteed to exist till the next Swarm.gc() run
        if (!repl) return;
        this._lstn || (this._lstn = []);
        // stateless object fire no events; essentially, on() is deferred
        this._lstn.push(this._version ? repl : [spec,val,repl]);
    },
    // Unsubscribe
    $_off: function (spec,val,repl) {
        if (!this._lstn) return;
        var stateful = this.stateful();
        this._lstn.filter(function(l){
            return stateful ? l!==repl : l[2]!==repl;
        });
    },
    // Sometimes we get an operation we don't support; not normally
    // happens for a regular replica, but still needs to be caught
    $_default: function (spec,val,repl) {
    },
    // As all the event/operation processing is asynchronous, we
    // cannot simply throw/catch exceptions over the network.
    // Hence, this method allows to send errors back asynchronously.
    $_err: function (spec,val,repl) {
        console.error('something failed: '+spec+' at '+repl._id);
    },
    // Deallocate everything, free all resources.
    close: function () {
        if (this._lstn && this._lstn.length)
            throw new Error('still has listeners');
        this._host.unregister(this);
    },
    // Once an object is not listened by anyone it is perfectly safe
    // to garbage collect it.
    gc: function () {
        if (!this._lstn || !this._lstn.length)
            this.close();
    },
    log: function(spec,value,replica) {
        console.log(this.fullspec(),'has',spec.method().toUpperCase(),value,'from',
                        replica&&replica.fullspec&&replica.fullspec());        
    }
});
Syncable.PRESTATE = {init:true,on:true,off:true};


var Model = Swarm.Model = Syncable.extend('Model',{
    default: {
        _oplog: Object
    },
    // Blindly applies the changeset to this model.
    apply: function (keyval) {
        for(var key in keyval)
            if (Model.reFieldName.test(key) && typeof(this[key])!=='function')
                this[key] = keyval[key];
    },
    /**  init modes:
    *    1  fresh id, fresh object
    *    2  known id, stateless object
    *    3  known id, state boot
    */
    $_init: function (spec,snapshot,host) {
        if (this._id===spec.version() && !snapshot._oplog) { // new fresh object  TODO nicer
            snapshot = snapshot || this._default || {};
            this.apply(snapshot);
        } else { // the state has arrived; apply it
            //if (snapshot._oplog) 
            //    throw new Error('need full state');
            this.unpackState(snapshot);
            this._oplog = snapshot._oplog; // TODO merge local edits & foreign oplog
            for (sp in this._oplog) {
                var v = new Spec(sp).version(); // TODO nicer
                if (v>this._version)
                    this._version=v;
            }
            delete snapshot._oplog;
            this.apply(snapshot);
        }
        Syncable._pt.$_init.apply(this,arguments);
    },
    
    $_on: function (spec,base,repl) {
        //  support the model.on('field',callback_fn) pattern
        if (repl && repl._isWrap && base.constructor===String) {
            repl._deliver = repl.deliver;
            repl.deliver = function (spec,val,src) {
                if (typeof(val)==='object' && (base in val))
                    this._deliver(spec,val,src);
            }
        }
        // this will delay response if we have no state yet
        Syncable._pt.$_on.call(this,spec,base,repl);
        if (!this._version)
            return;
        // respond: send back a diff, then a reciprocal subscription (reon)
        if (base!==undefined&&repl) {
            var diff = this.diff(base);
            diff && repl.deliver(new Spec(this.spec()), diff, this); // strict 3sig TODO nicer
            if (spec.method()==='on' && typeof(repl.reon)==='function')
                repl.reon (this.spec(), this.version(), this); // TODO nicer sig, vid alloc
        }
    },
    
    $_off: function (spec,base,repl) {
        if (spec.method()==='off' && typeof(repl.reoff)==='function')
            repl.reoff (self.spec(), self.version(), self);
        if (this._version)
            Syncable.prototype.$_off.apply(this,arguments);
        else
            this._lstn = this._lstn && 
                this._lstn.filter(function(l){return l.ln!==repl});
    },
    
    $_reon: '$_on',
    $_reoff: '$_off',
    
    version: function () {
        if (!this._version) return '';
        var map = new Spec.Map();
        map.add('!'+this._version);
        for(var op in this._oplog)
            map.add('!'+op); // FIXME
        return map.toString();
    },
    
    diff: function (base) {
        var ret = null;
        if (base) { // diff sync
            var map = new Spec.Map(base);
            for(var spec in this._oplog)
                if (!map.covers(spec)) {
                    ret || (ret = {});
                    ret[spec] = this._oplog[spec];
                }
        } else { // snapshot sync
            ret = {};
            var key = '!'+this._version+'.init';
            ret[key] = this.pojo();
            ret[key]._oplog = {};
            for(var spec in this._oplog)
                ret[key]._oplog[spec] = this._oplog[spec];
            this.packState(ret);
        }
        return ret;
    },
    
    // TODO remove unnecessary value duplication
    packState: function (state) {
    },
    unpackState: function (state) {
    },
    /** removes redundant information from the log */
    compactLog: function () {
        var sets = [], cumul = {}, heads = {};
        for(var spec in this._oplog)
            if (Spec.get(spec,'.')==='.set')
                sets.push(spec);
        sets.sort();
        for(var i=sets.length-1; i>=0; i--) {
            var spec = sets[i], val = this._oplog[spec], notempty=false;
            for(var key in val)
                if (key in cumul)
                    delete val[key];
                else
                    notempty = cumul[key] = true;
            var source = new Spec(key).source();
            notempty || (heads[source] && delete this._oplog[spec]);
            heads[source] = true;
        }
        return cumul;
    },
    // MERGING OFFLINERS + COLLAPSING THE LOG + SNAPSHOT
    //v 1. filter log // .set() for overwrites
    //v 2. when applying offliners - filter them
    //  3. snapshot includes the log
    //v 4. save()/set() compares the log and the values
    $$set: function (spec,value,repl) {
        var map = new VersionMap(this._version);
        var version = spec.version(), op = spec.filter('!.');
        if (op in this._oplog)
            return; // replay
        (this._version<version) && (this._version=version);
        this.compactLog(); // may empty value :)
        this.apply(value);
    },
    pojo: function () {
        var pojo = {};
        for(var key in this)
            if (Model.reFieldName.test(key) && this.hasOwnProperty(key))
                pojo[key] = this[key];
        return pojo;
    },
    save: function () {
        var cumul = this.compactLog(), changes = {}, pojo=this.pojo();
        for(var key in pojo)
            if (this[key]!==cumul[key]) // TODO nesteds
                changes[key] = this[key];
        for(var key in cumul)
            if (!(key in pojo))
                changes[key] = null; // JSON has no undefined
        this.set(changes);
    }
});
Model.reFieldName = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;


function Host (id) { // FIXME use the default (SomeSyncable)   :)
    this._host = this;
    if (id.charAt(0)==='#') id=id.substr(1);
    this._id = id;
    this.init('#'+id,null,this)
};

Swarm.Host = Syncable.extend(Host,{
    deliver: function (spec,val,repl) {
        if (spec.type()!=='Host') {
            var typeid = spec.filter('/#');
            var obj = this.objects[typeid];
            if (!obj) {
                // TODO
            }
            obj && obj.deliver(spec,val,repl);
        } else
            this._super.deliver.apply(this,arguments);
    },
    __init: function (spec,val,repl) {
        this.peers = {};
        this.objects = {};
        this.author;
        this.lastTs = ''; // FIXME default
        this.seq = 0;
        this.clockOffset = 0;
    },
    $_on: function (spec,clocks,peer) {
        if (spec.type()!=='Host') { // host.on('/Type#id') shortcut
            var typeid = spec.filter('/#');
            if (!(typeid in this.objects)) {
                var t = Syncable.types[spec.type()];
                new t(spec,undefined,this);
            }
            return this.objects[typeid].on(spec,clocks,peer);
        }
        
        var old = this.peers[peer._id];
        old && this.off(peer._id,null,old);
        
        if (clocks) {
            this.clockOffset;
        }
        this.peers[peer._id] = peer;
        spec.method()==='on' && peer.reon(this);
        
        for(var sp in this.objects)
            this.checkUplink(sp);
                
        this.__emit(spec,clocks,peer); // PEX hook TODO Q $$on?
    },
    $_off: function (spec,nothing,peer) {
        if (spec.type()!=='Host') { // host.off('/Type#id') shortcut
            var typeid = spec.filter('/#');
            var obj = this.objects[typeid];
            return obj && obj.off(spec,clocks,peer);
        }
        if (this.peers[peer._id]!==peer)
            throw new Error('peer unknown');
        delete this.peers[peer._id];
        for(var sp in this.objects) {
            var obj = this.objects[sp];
            if (obj._lstn && obj._lstn.indexOf(peer)!==-1) {
                obj.off(sp,'',peer);
                this.checkUplink(sp);
            }
        }
        spec.method()==='off' && peer.reoff(this);
    },
    // Returns an unique Lamport timestamp on every invocation.
    // Swarm employs 30bit integer Unix-like timestamps starting epoch at
    // 1 Jan 2010. Timestamps are encoded as 5-char base64 tokens; in case
    // several events are generated by the same process at the same second
    // then sequence number is added so a timestamp may be more than 5
    // chars. The id of the Host (+user~session) is appended to the ts.
    version: function () {
        var d = new Date().getTime() - Host.EPOCH + (this.clockOffset||0);
        var ts = Spec.int2base((d/1000)|0,5), seq='';
        if (ts===this.lastTs)
            seq = Spec.int2base(++this.seq,2); // max ~4000Hz
        else
            this.seq = 0;
        this.lastTs = ts;
        return ts + seq + '+' + this._id;
    },
    // Returns an array of available uplink peer ids according to the consistent
    // hashing scheme. Note that client-side code runs this logic as well:
    // it is perfectly OK for a client to connect to multiple edge servers.
    availableUplinks: function (spec) {
        var target = Swarm.hash(spec), threshold = Swarm.hashDistance(this._id,target);
        var self=this, uplinks=[];
        for(var id in this.peers) {
            var dist = Swarm.hashDistance(id,target); //Math.abs(hash(id)-target);
            dist<=threshold && uplinks.push({id:id,distance:dist});
        }
        uplinks.sort(function(x,y){ return x.distance - y.distance });
        return uplinks.map(function(o){return self.peers[o.id]});
    },
    // Subscribes an object to the closest uplink (closest in terms of consistent
    // hashing). Cancels any other preexisting subscriptions.
    checkUplink: function (spec) {
        var obj = this.objects[spec];
        var uplinks = this.availableUplinks(spec);
        var closest = uplinks.shift() || STUB;
         
        if (!obj._lstn || obj._lstn.indexOf(closest)===-1)
            closest.on(spec,obj.version(),obj);
            
        while (almost=uplinks.pop()) // B I N G O
            if (obj._lstn.indexOf(almost)!==-1)
                almost.off(spec,'',obj);;
    },
    register: function (obj) {
        var spec = obj.spec();
        if (spec in this.objects)
            return this.objects[spec];
        this.objects[spec] = obj;
        this.checkUplink(spec);
        return obj;
    },
    unregister: function (obj) {
        var spec = obj.spec();
        // TODO unsubscribe from the uplink - swarm-scale gc
        (spec in this.objects) && delete this.objects[spec];
    },
    $_reon: '$_on',
    $_reoff: '$_off'
});
Host.MAX_INT = 9007199254740992;
Host.EPOCH = 1262275200000; // 1 Jan 2010 (milliseconds)
Host.MAX_SYNC_TIME = 60*60000; // 1 hour (milliseconds)
Swarm.HASH_FN = murmurhash3_32_gc;
Swarm.CHASH_POINT_COUNT = 3;

Swarm.hash = function hash (str) {
    var ret = [];
    // TODO rolling cache
    for(var i=0; i<Swarm.CHASH_POINT_COUNT; i++)
        ret.push(Swarm.HASH_FN(str,i))
    return ret;
};


Swarm.hashDistance = function hashDistance (id1,id2) {
    var hash1 = id1.constructor===Array ? id1 : id1=Swarm.hash(id1.toString());
    var hash2 = id2.constructor===Array ? id2 : id2=Swarm.hash(id2.toString());
    var mindist = 4294967295;
    for(var i=0; i<Swarm.CHASH_POINT_COUNT; i++)
        for(var j=i; j<Swarm.CHASH_POINT_COUNT; j++)
            mindist = Math.min( mindist, Math.abs(hash1[i]-hash2[j]) );
    return mindist;
};

var STUB = {
    deliver:function(){},
    on:function(){},
    off:function(){}
};


