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

Spec.Map = function VersionMap () {
    this.map = {};
};
Spec.Map.prototype.add = function (version) {
    var m = Spec.reTokExt.exec(version);
    if (!m) return;
    var ts = m[1], src = m[2];
    if (ts > (this.map[src]||''))
        this.map[src] = ts;
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

/**  All state-changing methods of a syncable class must be...
  *  $$operation
  *  $_no-emit-operation
  *  _$rpcCall  
  *  __sig3Method
  *  plainMethod()
  */
Syncable.extend = function(fn,own) { // TODO Backbone extend port?
    if (typeof(fn)!=='function') {
        if (typeof(fn)!=='string')
            throw new Error('1st argument: constructor or class name');
        var id = fn;
        fn = Syncable.types[id] = function Syncable (id,val,host) {
            this._host = host || Swarm.localhost;
            var version = this._host.version();
            this._id = (Spec.is(id) ? new Spec(id).id() : id) || version;
            var spec = this.spec();
            if (spec in this._host.objects)
                return this._host.objects[spec];
            this._host.objects[spec] = this;
            this._lstn = null;
            this.init(spec.toString()+'!'+version+'.init',val,host);
            this._host.relink(this); // ?
        };
        fn.id = fn.name = id;
    } else
        fn.id = fn.name;
    var fnproto = fn.prototype, myproto = this.prototype;
    for (var prop in myproto) // inherit methods and fields
        fnproto[prop] = myproto[prop];
    if (own.default)
        fnproto._default = own.default; // TODO field by field
    var re_acname = /^([$_])([$_])(\w+)$/;
    // wrap the operation's code with signature normalization
    //if (own[prop].constructor===String) fn=own[own[prop]];
    function sigwrap (proto,acname,alias) {
        var m = acname.match(re_acname);
        var receivable = (m[1]==='$'), emittable = (m[2]==='$'), name = m[3];
        proto[name] = function() {
            this.normalizeSignature(arguments,name);
            var spec=arguments[0], value=arguments[1], replica=arguments[2];
            Swarm.debug && console.log(this.fullspec(),'has',name.toUpperCase(),value,'from',
                replica&&replica.fullspec&&replica.fullspec());
            var ret = this[acname](spec,value,replica);
            emittable && this.__emit(spec,value,replica);
            return ret || this; // ?
        }
    }
    for (var prop in own) {// extend
        if (re_acname.test(prop)) { // an op
            sigwrap(fnproto,prop);
            typeof(own[prop])==='string' && (own[prop]=own[own[prop]]); // aliases
        }
        fnproto[prop] = own[prop];
    }
    for(var prop in this) // inherit static functions
        if (typeof(this[prop])==='function')
            fn[prop] = this[prop];
    fnproto._super = myproto;
    fnproto._type = fn.id;
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
    if (len===0 || len>3) throw new Error('invalid number of arguments');
    // normalize replica/callback
    if (typeof(args[len-1])==='function') // model.on(callback)
        args[len-1] = {deliver:args[len-1]};
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
    spec: function () { return '/'+this._type+'#'+this._id; }, 
    fullspec: function () { return '@'+this._host._id+this.spec() },
    deliver: function (spec,value,lstn) {
        var method = spec.method();
        var impl = ('$$'+method in this) ? '$$'+method : '$_'+method;
        if (typeof(this[impl])==='function')
            this[method](spec,value,lstn); // this[impl] to optimize
        else
            this.default(spec,value,lstn);
    },
    __emit: function (spec,value,source) {
        var ls = this._lstn;
        this._lstn = []; // cycle protection
        if (!ls) return;
        for(var i=0; i<ls.length; i++)
            if (ls[i] && ls[i]!=source) try {// don't relay back to the source
                ls[i].deliver(spec,value,this);
            } catch (ex) {
                console.error(ex);
            } 
        if (this._lstn.length) throw '!';
        this._lstn = ls; // cycle protection
    },
    __init: function (spec,val,host) {
        this._id;
        this._lstn;
        this._default;
        this._host.registry[this.spec()] = this;
    },
    $_on: function (spec,val,repl) {   // WELL  on() is not an op, right?
        this._lstn;
    },
    $_off: function (spec,val,repl) {
        return i;
    },
    $_default: function (spec,val,repl) {
    },
    $_err: function (spec,val,repl) {
        console.error('operation failed: '+spec+' at '+repl._id);
    },
    close: function () {
        this.__emit('.off'); //...
    },
    gc: function () {
        
    }
});

var Model = Swarm.Model = Syncable.extend('Model',{
    deliver: function (spec,value,lstn) {
        var self = this, pattern = spec.pattern();
        function apply (opspec,opval,opsrc) {
            Syncable.prototype.deliver.apply(self,arguments);
            self._oplog[opspec.filter('!.')] = opval;
        }
        if (pattern==='/#!.') {
            apply(spec,value,lstn);
        } else if (pattern==='/#') { // unbundle
            var specs = [];
            for (var sp in value)
                Spec.pattern(sp)==='!.' && specs.push(sp);
            specs.sort().reverse();
            while (s=specs.pop())
                this.deliver(new Spec(spec.toString()+s),value[s],lstn); // TODO polish
        } else throw new Error('malformed spec: '+spec);
    },
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
        //if (spec.has('#') && val)
        //    throw new Error('init by either id or value');
        snapshot = snapshot || this._default || {};
        if (this._id===spec.version()) { // fresh object
            this._version = this._id;
            this._oplog = {};
            this.apply(snapshot);
        } else {
            if (snapshot._oplog) { // the state has arrived; apply 
                this._version = spec.version();
                this._oplog = snapshot._oplog;
                this.unpackState(snapshot);
            } else {// waiting for the state
                this._version = null;
                this._oplog = {};
            }
            this.apply(snapshot);
        }
    },
    
    version: function () {
        if (!this._version) return '';
        var map = new Spec.Map();
        map.add(this._version);
        for(var op in this._oplog)
            map.add(op);
        return map.toString();
    },
    
    diff: function (spec,base) {
        var ret = {};
        if (base) { // diff sync
            var map = new VersionMap(base);
            for(var spec in this._oplog)
                if (!map.includes(spec))
                    ret[spec] = this._oplog[spec];
        } else { // snapshot sync
            ret['!'+this._version+'.init'] = this.pojo();
            for(var spec in this._oplog)
                ret[spec] = this._oplog[spec];
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
    filterSetOps: function () {
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
        this.filterSetOps(); // may empty value :)
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
        var cumul = this.filterSetOps(), changes = {}, pojo=this.pojo();
        for(var key in pojo)
            if (this[key]!==cumul[key]) // TODO nesteds
                changes[key] = this[key];
        for(var key in cumul)
            if (!(key in pojo))
                changes[key] = null; // JSON has no undefined
        this.set(changes);
    },
    $_on: function (spec,base,repl) {
        this._lstn || (this._lstn = []);
        if (base||base==='') {
            var self = this;
            function sync () {
                var diff = self.diff(base);
                diff && repl.deliver(new Spec(self.spec()), diff, self); // strict 3sig
                spec.method()==='on' && repl.reon (self.spec(), self.version(), self);
            };
            this._version ? sync() : this.once(sync);
        } else { // plain listener
            // add it as a filtered set() listener
        }
        this._lstn.push(repl);
    },
    $_off: function (spec,val,repl) {
        if (this._super.$off.apply(this,arguments)==0)
            this._linkup();
    },
    $_reon: '$_on',
    $_reoff: '$_off'
});
Model.reFieldName = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/;


function Host (id) {
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
        this.uplinks = {};
        this.downlinks;
        this.author;
        this.lastTs = '';
        this.seq = 0;
        this.clockOffset = 0;
    },
    relink: function (obj) {
        var spec = obj.spec();
        var oldUplinkId = this.uplinks[spec];
        var newUplinkId = this.uplinks[spec] = this.uplink(spec);
        if (oldUplinkId!==newUplinkId) {
            oldUplinkId && this.peers[oldUplinkId].off (spec,null,obj);
            newUplinkId && this.peers[newUplinkId].on (spec,obj.version(),obj);
        }
        //   downlinks are regular listeners => _lstn[]
        //   host.deliver() delivers => pipe does host.deliver()
        //   the uplink needs to be relinked => need to pick, need to calc fast
        //   the uplink must send reon() => not always defined and mentioned in _lstn
        //   we are the uplink to our downlinks =>  reon() versioned
        //   we don't want to calc 10000 hashes at once => hashes:{spec:int} hidden
        //   OPTION1: host=_lstn[0] is the proxy/substitute for the uplink
        //   OPTION2: _lstn[0] is the uplink
        // v OPTION3: uplink is remembered in uplinks:{spec:hostid}, _lstn depends
        //   also: this._host.on(this.spec()) is logical :)
        //   also: a client may connect to several uplinks :)
    },
    $_on: function (spec,clocks,peer) {
        if (spec.type()!=='Host') { // host.on('/Type#id') shortcut
            var typeid = spec.filter('/#');
            if (!(typeid in this.objects)) {
                var t = Syncable.types[spec.type()];
                new t(spec,clocks,this);
            }
            return this.objects[typeid].on(spec,clocks,peer);
        }
        
        var old = this.peers[peer._id];
        old && this.off(peer._id,null,old);
        
        if (clocks) {
            this.clockOffset;
        }
        this.peers[peer._id] = peer;
        
        for(var spec in this.objects)
            if (this.uplink(spec)===peer)
                this.relink(this.objects[spec]);
                
        this.__emit(spec,clocks,peer); // PEX hook TODO Q $$on?
    },
    $_off: function (spec,nothing,peer) {
        delete this.peers[peer._id];
        for(var spec in this.objects) 
            if (this.uplink(spec)===peer)
                this.relink(this.objects[spec]);
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
    uplink: function (spec) {
        var target = hash(spec), closest='', mindist=Host.MAX_INT;
        for(var id in this.peers) {
            var dist = Math.abs(hash(id)-target);
            if (dist < mindist) {
                closest = id;
                mindist = dist;
            }
        }
        return closest;
    },
    $_reon: '$_on',
    $_reoff: '$_off'
});
Host.MAX_INT = 9007199254740992;
Host.EPOCH = 1262275200000; // 1 Jan 2010 (milliseconds)
Host.MAX_SYNC_TIME = 60*60000; // 1 hour (milliseconds)
function hash (str) {
    return 1;
}

var STUB = {deliver:function(){}};


