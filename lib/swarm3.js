var Swarm = {};

function Spec (str) {
    // str is spec or an array
    this.value = (str||'').toString().match(Spec.reQTokExt) || [];
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
    var wrap = function sigwrapd() {
        this.normalizeSignature(arguments,name);
        var spec=arguments[0], value=arguments[1], replica=arguments[2];
        Swarm.debug && this.log(spec,value,replica);
        if (!this._id)
            throw new Error('undead object invoked');

        // TODO this.validate(), this.acl()

        var returnedValue = this[acname](spec,value,replica);

        emittable && this.__emit(spec,value,replica);
        if (emittable && this._oplog) { // remember in the log
            //var verop = spec.filter('!.');
            //verop && (this._oplog[verop] = value);
            this._oplog[spec.filter('!.')] = value;
        }
        if (receivable||emittable) { // state changing
            var opver = spec.version();
            if (this._version!==opver) // ? TODO
                this._version = (opver>this._version) ? opver : this._version+'!'+opver;
        }
        // to force async signatures we eat the returned value silently
        return spec;
    }
    wrap._impl = acname;
    proto[name] = wrap;
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
        fn = Syncable.types[id] = function SomeSyncable () {
            // initialize fields
            for(var key in this._default) {
                var def = this._default[key]; // TODO values
                this[key] = def&&def.constructor===Function ? new def() : def;
            }
            // make sense of arguments
            var args=arguments, al=args.length, state={};
            if (id==='Host')
                this._host = this;
            else
                this._host = (al && args[al-1].constructor===Host) ?
                    args[al-1] : Swarm.localhost;
            var version = this._host.version();
            if (al && args[0].constructor===String && Spec.reTokExt.test(args[0])) {
                this._id = args[0];
                state = undefined; // may pull the state for the id
            } else if (al && Spec.is(args[0])) {
                this._id = new Spec(args[0]).id();
                state = undefined;
            } else {
                args[0]!==this._host && (state=args[0]);
                this._id = version;
            }
            // register with the host
            var doubl = this._host.register(this);
            if (doubl!==this) return doubl;
            // initialize metadata _fields
            var spec = this.spec();
            spec.add('!',version);
            spec.add('.','init');
            // got state => may init
            state && this.init(spec,state,this._host);
            // connect to the sync tree
            this.checkUplink();
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
    var version = this._host.version(); // moment of *this* event FIXME on-demand
    // FIXME move to Host: constructor-as-a-type-id
    //if (args[0] && args[0].constructor===Function && 
    //        args[0].id && (args[0].id in Syncable.types))
    //    args[0] = '/'+args[0].id + '#' + version + '!' + version;
    //
    // normalize replica/callback
    if (typeof(args[len-1])==='function') // model.on(callback)
        args[len-1] = {deliver:args[len-1],_wrapper:true};
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
    // COMPLEX CASE: 1st arg may be a value which is a specifier
    if ( len<3 && ( (spec.type() && spec.type()!==this._type) ||
         (spec.id() && spec.id()!==this._id) ) ) {
             if (!args[1]) {
                args[1] = args[0];
                spec = args[0] = this.spec();
             } else
                throw new Error('not my event: '+spec);
         }
    spec.has('/') || (spec.add('/',this._type));
    spec.has('#') || (spec.add('#',this._id));
    spec.has('!') || (spec.add('!',version));
    spec.has('.') || (spec.add('.',method));
    spec.sort();
    args[0] = spec;
    // TODO the missing signature: x.emit('event',value), x.on('event',fn)
};


// Syncable includes all the (replica) spanning tree and (distributed)
// garbage collection logix.
Syncable.extend(Syncable,{
    default : {
        _lstn: Array,
        _id: '',
        _version: ''
    },
    spec: function () { return new Spec('/'+this._type+'#'+this._id); }, 
    // dispatches serialized operations back to their respective methods
    deliver: function (spec,value,lstn) {
        var pattern = spec.pattern();
        if (pattern==='/#!.') {
            //if (!this._version && !(spec.method() in Syncable.PRESTATE))
            //    throw new Error('only prestate methods allowed');
            var method = spec.method();
            if (typeof(this[method])==='function' && this[method]._impl)
                this[method](spec,value,lstn);
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
            if (ls[i] && ls[i]!==source && ls[i].constructor!==Array)
                try {// skip empties, deferreds and the source
                    ls[i].deliver(spec,value,this);
                } catch (ex) {
                    console.error(ex.message,ex.stack);
                } 
        if (this._lstn.length)
            throw new Error('Speedy Gonzales at last');
        this._lstn = ls; // cycle protection off
    },
    // Produce the entire state or probably the necessary difference
    // to synchronize a replica which is at version *base*.
    diff: function (base) {
    },
    $_init: function () {
    },
    acl: function (spec,val,src) {
        return true;
    },
    validate: function (spec,val,src) {
        return true;
    },
    // Subscribe to the object's operations;
    // the upstream part of the two-way subscription
    //  on() with a full filter:
    //    /Mouse#Mickey!now.on   !since.event   callback
    __on: function (spec,filter,repl) {   // WELL  on() is not an op, right?
        // if no listener is supplied then the object is only
        // guaranteed to exist till the next Swarm.gc() run
        // stateless object fire no events; essentially, on() is deferred
        if (!repl) return;
        this._lstn.length || this._lstn.push(undefined);

        if (this._lstn[0]) {
            var filter = new Spec(filter),
                base = filter.get('!'),
                event = filter.get('.');
            if (event) {
                if (event==='.init') {
                    repl.deliver(spec,this.pojo(),this);
                }
            }
            this._lstn.push( repl );
            if (base) {
                repl.deliver(this.spec(), this.diff(base), this);
                repl.reon (this.spec(), this._version || '!0', this);
            }
        } else {
            this._lstn.push( [spec,filter,repl] ); // defer this call (see __reon)
        }
        // TODO repeated subscriptions: send a diff, otherwise ignore
    },
    // downstream reciprocal subscription
    __reon: function (spec,base,repl) {
        if (!repl) throw new Error('?');
        var deferreds = [], dfrd, diff;
        if (!this._lstn[0]) {
            this._lstn[0] = repl;
            // do deferred diff responses and reciprocal subscriptions
            this._lstn = this._lstn.filter(function(ln,i){
                return !(ln.constructor===Array && deferreds.push(ln));
            });
            while (dfrd = deferreds.pop())
                this.__on.apply(this,dfrd);
        } else {
            console.warn('reon: violent uplink change: ',this._lstn[0],repl);
            this._lstn.unshift(repl);
            this._lstn[1].off(this.spec(),this);
        }
        if ( base && (diff=this.diff(base)) ) // TODO format
            repl.deliver(this.spec(),diff,this);
    },
    // Unsubscribe
    __off: function (spec,val,repl) {
        if (repl===this._lstn[0])
            throw new Error('off: it is an uplink');
        var stubs = !this._lstn[0];
        this._lstn.filter(function(l){
            return !stubs ? l!==repl : l[2]!==repl;
        });
    },
    __reoff: function (spec,val,repl) {
        if (this._lstn[0]!==repl)
            throw new Error('reoff: uplink mismatch');
        this._lstn[0] = undefined;
        this._id && this.checkUplink();
    },
    // Subscribes an object to the closest uplink (closest in terms of consistent
    // hashing). Cancels any other preexisting subscriptions.
    checkUplink: function () {
        var spec = this.spec();
        var uplinks = this._host.availableUplinks(spec);
        var closest = uplinks.shift();
         
        if (this._lstn[0]===closest) return;
        closest.on(spec+'!'+(this._version||'0'),this);
            
        while (almost=uplinks.pop()) // B I N G O
            if (this._lstn.indexOf(almost)!==-1)
                almost.off(spec,this);;
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
        var l=this._lstn, s=this.spec();
        var uplink = l.shift();
        this._id = null; // no id - no object; prevent relinking
        uplink && uplink.off(s,null,this);
        while (l.length)
            l.pop().reoff(s,null,this);
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
        console.log('@'+this._host._id,myspec,'got',spec.method().toUpperCase(),
                (myspec==spec.filter('/#')?'':'('+spec+')'),value,'from',
                replica&&replica.fullspec&&(replica.spec()+
                    (this._host===replica._host?'':' @'+replica._host._id)
                ));
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
            // TODO apply log tail
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
        //Syncable._pt.$_init.apply(this,arguments);
    },
    
    __on: function (spec,base,repl) {
        //  support the model.on('field',callback_fn) pattern
        if (repl && repl._isWrap && base.constructor===String) {
            repl._deliver = repl.deliver;
            repl.deliver = function (spec,val,src) {
                if (typeof(val)==='object' && (base in val))
                    this._deliver(spec,val,src);
            }
        }
        // this will delay response if we have no state yet
        Syncable._pt.__on.call(this,spec,base,repl);
        // FIXME retroactive init() delivery
    },
    
    __off: function (spec,base,repl) {
        Syncable.prototype.__off.apply(this,arguments);
        // TODO unwrap fn callbacks
        //this._lstn = this._lstn && 
        //    this._lstn.filter(function(l){return l.ln!==repl});
    },
    
    
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
        if (base && base!='!0') { // diff sync
            var map = new Spec.Map(base);
            for(var spec in this._oplog)
                if (!map.covers(spec)) {
                    ret || (ret = {});
                    ret[spec] = this._oplog[spec];
                }
            // TODO log truncation, forced init and everything
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


/** Host is (normally) a singleton object registering/coordinating
 *  all the local Swarm objects, connecting them to appropriate
 *  external uplinks, maintaining clocks, etc.
 *  Host itself is not fully synchronized like a Model but still
 *  does some event gossiping with peer Hosts.
 *  */
var Host = Swarm.Host = Syncable.extend('Host',{
    default: {
        lastTs: '',
        seq: 0,
        clockOffset: 0,
        peers: Object,
        objects: Object
    },
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
        this._storage = this._host;
        this._host = this; // :)
    },
    // Host forwards on() calls to local objects to support some
    // shortcut notations, like 
    //          host.on('/Mouse',callback)
    //          host.on('/Mouse.init',callback)
    //          host.on('/Mouse#Mickey',callback)
    //          host.on('/Mouse#Mickey.init',callback)
    //          host.on('/Mouse#Mickey!baseVersion',repl)
    //          host.on('/Mouse#Mickey!base.x',trackfn)
    // The target object may not exist beforehand.
    __on: function (spec,evfilter,peer) {
        if (evfilter) {
            if (evfilter.constructor===Function && evfilter.id)
                evfilter = '/' + evfilter.id;
            if (!Spec.is(evfilter)) 
                throw new Error('signature not understood');
            var flt = new Spec(evfilter);
            // TODO maintain timestamp all the way down the callgraph
            var version = this.version();
            if (!flt.has('/'))
                throw new Error('no type mentioned');
            if (!flt.has('#'))
                flt.set('#',version);
            var typeid = flt.filter('/#');
            var o = this.objects[typeid];
            if (!o) {
                var t = Syncable.types[flt.type()];
                // TODO pickup peer if fits (type,id,host===undefined)
                // --register
                o = new t(typeid,undefined,this);
            }
            o.on(typeid+'!'+version+'.on',flt.filter('!.'),peer);
            // We don't do this as the object may have no state now. 
            // return o;
            // Instead, use host.on('/Type#id.init', function(,,o) {})
            
        } else {  // Downlink/peer host subscription

            if (false) { // their time is off so tell them so
                this.clockOffset;
            }
            var old = this.peers[peer._id];
            old && old.off(peer._id,null,this);
            
            this.peers[peer._id] = peer;
            if (spec.method()==='on')
                peer.reon('/Host#'+peer._id+'!'+spec.version()+'.reon','',this);
            
            for(var sp in this.objects)
            this.objects[sp].checkUplink();

            this.__emit(spec,'',peer); // PEX hook
        }
    },
    __off: function (spec,nothing,peer) {
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
    checkUplink: function (spec) {
        //  TBD Host event relay + PEX
    },
    __reon: '__on',
    __reoff: '__off'
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


