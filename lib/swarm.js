/*
= Value proposition:
 Good old days: like a local app
* javascript client & server
* distributed generic sync
* automatic persistence
* local calls ~ rpc ~ events ~ data
* comparable to Redis, no serialization - NEED NATIVE MVCC OBJECTS
*/
/* 
//   Field may be an object id (for collections)
//   Object ID is a version id by default (create op)
 * Every ID is a version id
 * Version id: ts-src-seq, 1-3 ids, each id is 30 bits (6 base32, 4 bytes, 2 unicode chars)
 *  ts   UNIX second timestamp; epoch shifted to 1 Jan 2010
 *  src  (optional) author of the change, simply some account id
 *  seq  (optional) sequence number of the change; to assign multiple ids within a second
 *
 *  Storing ids as unicode strings.
//   Pro
//      * most of the time it will sit on the RAM idle
//      * we don't plan for CPU-intensive workloads
//      * we minimize the number of objects for gc
//      * we save on string headers (otherwise >24b per field: pointer plus headers)
//   Contra
//      * we do v8-like binary-field-name optimization
 */
//   Collections
//   May have object ids as keys. Cannot have arbitrary keys (wrap as an object then).
//   Collections are mostly 'lists of objects'.
//   Sorting by the value is a common feature; once the value changes send an RPC to the
//   collection(s), e.g. inboxes (could be many).

/**      O P E N  T O D O S
 *
 *    2. Peer.set => storage
 *    4. collection
 *      4.1 diff/set
 *      4.2 Array compat (SortedSet)
 *    5. address, PEX
 *
 * */

//  S W A R M  S P E C I F I E R S

function ID (str,src,ssn) {
    if (str.length===7) {
        ID.re_id_lim.lastIndex = 0;
        var m = ID.re_id_lim.exec(str);
        if (!m) throw new Error('malformed id',str);
        this.q = m[1]; // TODO .charCodeAt(0);
        this.ts = ID.uni2int(m[2]);
        this.seq = ID.uni1int(m[3]);
        this.src = ID.uni2int(m[4]);
        this.ssn = ID.uni1int(m[5]);
        this.cache = str;
    } else if (str.length===1) {
        this.q = str;
        this.ts = ((new Date().getTime()/1000)|0) - ID.EPOCH;
        if (this.ts!==ID.lastTs) {
            ID.lastTs = this.ts;
            ID.lastSeq = 0;
        }
        this.seq = ID.lastSeq++;
        this.src = (src||0)&0x3fffffff;
        this.ssn = (ssn||0)&0x7fff;
        this.cache = '';
    } else
        throw new Error('malformed args');
}
ID.rs_id_uni = '([!-,\'\\.\\/])($I{2})($I)($I{2})($I)'.replace(/\$I/g,'[0-\\u802f]');
ID.re_id_lim = new RegExp('^'+ID.rs_id_uni+'$');
ID.re_id_g = new RegExp(ID.rs_id_uni,'g');
ID.EPOCH = 1262275200; // 1 Jan 2010 (seconds)
Spec.ANCIENT_TS = '000';
Spec.re_fieldVersion = /(\.[0-\u802f]{6})(\![0-\u802f]{6})/g;

ID.uni2int = function (uni) {
    return ((uni.charCodeAt(0)-0x30)<<15) | uni.charCodeAt(1)-0x30;
};
ID.uni1int = function (uni) {
    return uni.charCodeAt(0)-0x30;
};
ID.int3uni = function (i2,i1) {
    return String.fromCharCode (0x30+(i2>>15),0x30+(i2&0x7fff),0x30+i1);
};
ID.int3base = function (i2,i1) {
    var ret = [];
    for(var i=0; i<15; i+=5)
        ret.push(ID.base32.charAt((i1>>i)&31));
    for(; i2; i2>>=5)
        ret.push(ID.base32.charAt(i2&31));
    return ret.reverse().join('').replace(/^a+/,'') || 'a';
}
ID.base32uni = function (base32) {
    var ret = [];
    while (base32) {
        var tail = base32.substr(-3);
        base32 = tail.length===3 ? base32.substr(0,base32.length-3) : '';
        var val = 0;
        for(var i=0; i<tail.length; i++) {
            val<<=5;
            val|=ID.base32.indexOf(tail.charAt(i));
        }
        ret.push(String.fromCharCode(0x30+val));
    }
    while (ret.length<3) ret.push('0');
    return ret.reverse().join('');
};
ID.base32 = 'abcdefghijklmnopqrstuvwxyz234567';

ID.prototype.toString = function () {
    return this.cache ||   // TODO think zeroing the cache
        (this.cache = this.q + ID.int3uni(this.ts,this.seq) + ID.int3uni(this.src,this.ssn));
};

ID.prototype.toString32 = function () {
    var t1 = ID.int3base(this.ts,this.seq);
    var t2 = ID.int3base(this.src,this.ssn);
    if (t2==='a') t2='';
    function up(str) {
        return str ? str.charAt(0).toUpperCase()+str.substr(1) : '';
    }
    switch (this.q) {
        case '/': return up(t1)+up(t2);
        case ',': ;
        case '.': return t1+up(t2);
        default : return t1+'_'+t2;
    }
};

ID.as = function (str, defQuant) {
    if (str.prototype===ID)
        return str;
    if (str._id)
        return str._id.constructor===String?new ID(str._id):str._id;
    if (str.toString().match(ID.re_id_lim))
        return new ID(str.toString());
    return ID.parse32(defQuant,str);
};

ID.parse32 = function (quant,base32) {
    base32 = base32.replace(/([a-z2-7])([A-Z])/g,'$1-$2');
    base32 = base32.replace(/_/g,'-');
    base32 = base32.toLowerCase();
    if (base32.indexOf('-')===-1)  base32 += '-a';
    var m = base32.match(ID.re_id_32);
    if (!m)
        throw new Error('malformed base32 RFC4648 "9-9" id',base32);
    var tsseq = ID.base32uni(m[1]);
    var srcssn = ID.base32uni(m[2]);
    return new ID(quant+tsseq+srcssn);
};
ID.re_id_32 = /([a-z2-7]{1,9})-([a-z2-7]{1,9})/;

/***/
function Spec (spec, scope) {
    this.type =
        this.id = 
        this.field = 
        this.key = 
        this.method = 
        this.version = 
        this.base = 
        this.cache = '';

    if (spec.constructor===Spec) {
        scope = spec;
        spec = '';
    }

    var tok, m = spec ? spec.toString().match(ID.re_id_g) : [];

    if (!m) {
        if ( spec in Spec.wireNames )
            spec = Spec.wireNames[spec];
        else
            throw new Error('unrecognized literal',spec);
    }

    if ( m || (m=spec.match(ID.re_id_g)) ) { // TODO incompl match
        this.cache = spec.toString();
        while (tok=m.pop()) {
            var o = Spec.quants.indexOf(tok.charAt(0));
            if (o===-1)
                throw new Error('unknown quant',tok.charAt(0));
            var key = Spec.order[o];
            this[key] += tok;
        }
    } else
        throw new Error('malformed specifier or unknown literal',spec);

    if (scope) {
        scope = Spec.as(scope);
        for(var i=0; i<Spec.order.length; i++) {
            var key = Spec.order[i];
            if (scope[key])
                this[key] = scope[key];
        }
        this.cache = '';
    }
}

Spec.wireNames = {
    'on': "'==on==",
    'off': "'==off=",
    'Peer': '/=Peer='
};
for(var key in Spec.wireNames)
    Spec.wireNames[Spec.wireNames[key]] = key;

Spec.as = function (spec,defaultQuant,scope) {
    if (spec.constructor===Spec)
        return spec;
    else
        return new Spec(spec,scope,defaultQuant);
};

Spec.is = function (str) {
    return str.constructor===Spec || str.toString().match(ID.re_id_g);
}

Spec.getPair = function (str,key) {
    str = str || '';
    var i = str.indexOf(key);
    return i===-1 ? '' : str.substr(i+7,7);
};

Spec.setPair = function (str,key,val) {
    var i = str.indexOf(key);
    if (i===-1) return str+key+val;
    return str.substr(0,i) + key + val + str.substr(i+14);
};

Spec.maxVersions = function (specstr,quant) {
    ID.re_id_g.lastIndex = 0;
    var m=[], map={}, ret=[];
    while (m=ID.re_id_g.exec(specstr)) {
        if (quant && m[1]!=quant) continue;
        var src=m[4]+m[5], time=m[2]+m[3];
        if (time>(map[src]||''))
            map[src] = time;
    }
    for(var src in map)
        ret.push('$',map[src],src);
    return ret.join('');
};

function Base(){  // FIXME ugly
}
Base.prototype.toString = function () {
    var ret = [];
    for (var key in this)
        if (this.hasOwnProperty(key)) // FIXME HORROR
            ret.push(this[key]);
    return ret.join('');
};

Spec.prototype.parseBase = function () {
    if (this.base.constructor!==String) return;
    ID.re_id_g.lastIndex = 0;
    var m = [], res = new Base();
    while (m=ID.re_id_g.exec(this.base))
        res[m[4]+m[5]] = m[0];
    this.base = res;
};

Spec.prototype.parse = function (quants) {
    quants = quants || Spec.quants;
    var qlist = quants.match(/./g), quant;
    while (quant=qlist.pop()) {
        if (quant=='$') {
            this.parseBase();
        } else {
            var i = Spec.quants.indexOf(quant);
            var name = Spec.order[i], val = this[name];
            if (!val || val.constructor===ID) continue;
            this[name] = new ID(val);
        }
    }
    return this;
};

Spec.prototype.toString = function () {
    if (this.cache) return this.cache;
    var ret = [], ord=Spec.order;
    for(var i=0; i<ord.length; i++)
        if (this[ord[i]])
            ret.push( this[ord[i]].toString() );
    this.cache = ret.join('');
    if (this.cache.indexOf('function')!==-1)
        throw '!';
    return this.cache;
};

/** debugging only! */
Spec.prototype.toString32 = function () {
    var ret = [], ord=Spec.order;
    for(var i=0; i<ord.length; i++) {
        var v = this[ord[i]];
        if (!v) continue;
        if (ord[i]==='base')
            continue; // FIXME
        if (v.constructor===String)
            this[ord[i]] = v = new ID(v);
        ret.push( v.q, v.toString32() );
    }
    return ret.join('');
};
Spec.order = ['type','id','field','key','method','version','base'];
Spec.quants = '/#.,\'!$';
SpecValEmitter.tokList = ['type','method','id','field'];

function Diff(scope){
    this._scope = scope&&Spec.as(scope) || '';
}

/*Diff.prototype.add = function (spec,val) {
    if (spec.constructor===Diff)
        return this.merge(spec);
    if (this._scope) {
        spec = Spec.as(spec,'.'); // if: manually filled diff
        if (!this._scope.covers(spec))
            this.unscope();
        else
            spec.sco
    }
};

Diff.prototype.merge = function (diff) {
};*/

function svdebug (host,event,spec,val) {
    console.log(
            '\t',
            host._id&&ID.as(host._id).toString() || '(no id)',
            event,
            Spec.as(spec||'').toString()||"''",
            val.toString()
        );
}
function svdebug () {}

function SpecValEmitter () {
    this._lstn = [];
}
SpecValEmitter._p = SpecValEmitter.prototype;
SpecValEmitter._p._svsrc = true; // flag

SpecValEmitter._p.on = function svon (spec,fn) {
    if (!this._lstn)
        this._lstn = spec ? {} : [];
    if (!fn && (spec.constructor===Function || spec.set.constructor==Function)) {
        fn = spec;
        spec = '';
    }
    if (!spec && this._lstn.constructor===Array) {
        this._lstn.push(fn); // no filtering
        return;
    }
    spec = Spec.as(spec,this._defQuant);
    svdebug(this,'on',spec,fn);
    var key = spec.id || spec.field || spec.method || spec.type; // FIXME tokList
    if (this._lstn.constructor===Array)
        this._lstn = { '' : this._lstn } ;
    var lstn = this._lstn[key];
    if ( lstn ) {
        if (lstn.constructor!==Array)
            lstn = [lstn];
        lstn.push(fn);
    } else
        lstn = fn;
    this._lstn[key] = lstn;
};

function offArray(array,elem) {
    var i = array.indexOf(elem);
    if (i!==-1)
        array.splice(i,1);
}

SpecValEmitter._p.off = function svoff (spec,fn) {
    var self = this;
    svdebug(this,'off',spec,fn);
    function oneOff (spec,fn) {
        var lstn = self._lstn[key];
        if (lstn.constructor===Array) {
            offArray(lstn,fn);
            if (lstn.length===0)
                delete self._lstn[key];
        } else if (lstn===fn)
            delete self._lstn[key];
    }
    if (this._lstn.constructor===Array) {
        offArray(this._lstn,fn);
    } else if (spec===undefined) {
        for(var key in this._lstn)
            oneOff(key,fn); // kill'em all TODO perf
    } else {
        var key = Spec.as(spec,this._defQuant).toString();
        if (key.length>7)
            throw new Error('one-token spec only');
        oneOff(key,fn);
    }
};

SpecValEmitter._p.emit = function sve (spec,val,src,src2) { // TODO neater (src2)
    if (!this._lstn) return;
    var listeners=[], lstn;
    if (this._lstn.constructor===Array) {
        listeners = this._lstn;
    } else {
        if ('' in this._lstn)
            listeners = listeners.concat(this._lstn['']);
        spec = Spec.as(spec,this._defQuant);
        var tl = SpecValEmitter.tokList;
        for(var i=tl.length-1; i>=0; i--) {
            var tok = spec[tl[i]];
            if (!tok) continue;
            lstn = this._lstn[tok];
            if (!lstn) continue;
            if (lstn.constructor!==Array)
                listeners.push(lstn);
            else
                listeners = listeners.concat(lstn);
        }
    }
    svdebug(this,'emit',spec,val);
    for (var j=0; j<listeners.length; j++) {
        lstn = listeners[j];
        if (lstn===src || lstn===src2) continue;
        // FIXME recursive processing safeguard
        try{ 
            if (lstn.constructor===Function)
                lstn(spec,val,src,src2);
            else
                lstn.set(spec,val,src,src2);
        } catch (ex) {
            console && console.error('error in the listener',ex,ex.stack);
        }
    }
};

/**
 *
 * */
function Peer (id) {
    if (id.constructor===String)
        id = new ID(id);
    this._id = id;
    this._lstn = {};
    this._emitting = {};
    this.peers = {};
    this.hashes = Peer.hashRing(this._id);
    this.storage = new Stub();
}  // TODO: cool, Peer is itself syncd

Peer.prototype.close = function () {
    // peer.close ~ closing all the pipes TODO
    /*if (this.peers)
        for(var pid in this.peers)
            this.peers[pid].close(); //off('',this);
    this.peers = null;*/
    //for(var object in this.ids)
    //    this.ids[object].off();
    //delete this.ids;
};


// T I M E,  O B J E C T  A N D  V E R S I O N  I D S


// P E E R S,  U P L I N K S,  C O N S I S T E N T  H A S H I N G

/** Note. Use collection peers to track the swarm; the first
 * connected peer is likely the uplink; uplink switches a lot
 * as the peer keeps connecting - this way we test our
 * failover algorithms at each start-connect cycle. */
Peer.prototype.addPeer = function addPeer (peer) {
    var self = this;
    var pid = peer._id;
    svdebug(this,'+peer',pid,peer);
    if (pid in self.peers) {
        // FIXME kick it out
        throw new Error('peer was already added: '+pid);
    }
    self.peers[pid] = peer;
    // TODO this.pexes.set(pid,url);
    //    redistribute load to the new peer
    for(var oid in self._lstn) {
        if (oid.charAt(0)!=='#') continue;
        var newup = this.findUplink(oid), oldup;
        if (newup===peer) {
            if (oldup = this.findUplink(oid,newup))
                oldup.off(oid,this);
            var obj = this.findObject(oid);
            newup.on (obj?obj.spec()+obj.base():oid, this);
            //console.log(this._id+' uplinks '+oid+' to '+newup._id);
        }
    }
    this.emit(Spec.wireNames['Peer']+peer._id,true);
    //console.log(this._id.toString()+' added '+peer._id.toString());
};

Peer.prototype.removePeer = function removePeer (peer) {
    var self = this;
    var pid = peer._id&&peer._id.toString() || peer.toString();
    peer = this.peers[pid];
    svdebug(this,'-peer',pid,peer);
    if (!peer)
        throw new Error('peer unknown: '+pid);
    for(var oid in this._lstn) {
        if (oid.charAt(0)!=='#') continue;
        //var obj = this.ids[object];
        var oldup = this.findUplink(oid);
        if (oldup===peer) {
            var newup = this.findUplink(oid,oldup); // TODO merge
            var obj = this.findObject(oid);
            newup.on(obj?obj.spec():oid,this);
            oldup.off(oid,this);
            //console.log(this._id+' uplinks '+oid+' to '+newup._id);
        }
    }
    this._off(undefined,peer);
    delete this.peers[pid];
    this.emit(Spec.wireNames['Peer']+peer._id,false);
    //console.log(this._id.toString()+' removed '+peer._id.toString());
};

var salts = [0];

Peer.hashRing = function (id) {
    id = ID.as(id);
    var ring = [];
    if (id.src===0) {
        var hash = ID.as(id).hash();
        for(var i=0; i<salts.length; i++)
            ring.push(hash^salts[i]); // TODO wrong
    }
    return ring;
};

ID.prototype.hash = function () {
    //for (var i = 0; i < len; i++)
    //    res = res * 31 + str.charCodeAt(i);
    //return res&0x7fffffff;
    return this.src ^ this.ssn;
};


Peer.distance = Peer.prototype.distance = function (hash,peer) {
    if (hash.constructor===String) hash = new ID(hash);
    if (hash.constructor===ID) hash = hash.hash();
    peer = peer || this;
    if (!peer._hashes)
        peer._hashes = Peer.hashRing(peer._id);
    var minDist = 0x7fffffff;
    var hashes = peer._hashes;
    for(var i=0; i<hashes.length; i++)
        if ( (hashes[i]^hash) < minDist )
            minDist = hashes[i]^hash;
    return minDist;
};

Peer.prototype.findUplink = function (obj,except) {
    var nopid = except ? (except._id || except) : '';
    var minDist = this.distance(obj),
        minPeer = this.storage;
    var hash = ID.as(obj._id||obj).hash();
    for(var pid in this.peers) {
        if (pid==nopid) continue;
        var peer = this.peers[pid];
        var dist = Peer.distance(hash,peer);
        if (minDist>=dist) 
            if (minDist>dist || peer._id<this._id) {
                minDist = dist;
                minPeer = peer;
            }
    }
    return minPeer;
};

Peer.prototype.findObject = function (spec) {
    spec = Spec.as(spec);
    var object = spec.id.toString();
    var o = this._lstn[object];
    if (o) { 
        if (o.constructor===Array) {
            for(var i=0; i<o.length; i++)
                if (o[i]._id==object) // ==, not ===
                    return o[i];
        }
        if (o._id==spec.id) // ==, not ===
            return o;
    }
    return undefined;
};

Peer.prototype.createObject = function(spec,prefab) {
    spec = Spec.as(spec).parse('/');
    var fn = Peer.prototypes[spec.type], object = spec.id;
    if (!fn)
        throw new Error('unknown type');
    var obj = prefab || new fn(object);
    obj._id = object; // just make sure
    obj._host = this; // FIXME kill kill kill
    obj._vmap = obj._vmap || '';
    obj._lstn = [];
    obj.on('',this); // subscribe to the object's changes
    var needUpOn = !(object in this._lstn);
    this._on(object,obj); // subscribe the object
    if (needUpOn) {
        var up = this.findUplink(object);
        up.on(spec.type+object+'$000000',this); // no base; we need a complete state boot
    }
    return obj;
};

Peer.prototype.createId = function (quant) {
    return new ID(quant||'!',this._id.src,this._id.ssn);
};

//  P E E R'S  3 - M E T H O D  I N T E R F A C E

Peer.prototype.on = function (spec,listener) {
    var obj, ln=listener;
    // get spec
    switch (spec.constructor) {
        case Function:  spec = spec.name; //break;
        case String:    spec = Spec.as(spec,'/'); break;
        case ID:        spec = new Spec(spec.toString()); break;
        case Spec:      break;
        default:        if (typeof(spec)==='object' && spec._id) {
                            ln = spec;
                            spec = Spec.as(ln._id);
                        } else
                            throw new Error('cannot understand parameters');
    }
    if (!spec.tid && ln && ln._type)
        spec.type = ln._type;
    // find an existing object
    if (!obj && spec.id)
        obj = this.findObject(spec);
    if (obj && spec.base) {
        var diff = obj.diff(spec.base);
        if (diff)
            ln.set(obj.spec(),diff,this);
    }
    // gen an object if not yet
    if (!obj && !spec.id)
        spec.id = this.createId('#');
    // create and subscribe new obj
    if (!obj && spec.type) // TODO NOTE always listener N0
        obj = this.createObject(spec, ln && ln._type==spec.type ? ln : undefined);

    if (!obj)
        throw new Error('incomplete specifier: '+spec);

    if (ln && ln!==obj)
        this._on(spec.id,ln);

    if (ln && ln._id && ln._id in this.peers) {
        if (Peer.distance(spec.id,ln) > Peer.distance(spec.id,this))  // FIXME  dist==dist
            ln.on(obj.spec()+obj.base(),this);
    }

    return obj;
};

Peer.prototype._on = SpecValEmitter._p.on;
Peer.prototype._off = SpecValEmitter._p.off;
Peer.prototype.emit = SpecValEmitter._p.emit;

/** Remove objects which are not listened to, except by their uplink */
Peer.prototype.gc = function ( ) {
    for(var object in this._lstn) {
        if (object.charAt(0)!=='#') continue;
        var obj = this._lstn[object];
        if (obj.constructor===Array)
            if (obj.length===1)
                obj=obj[0];
            else
                continue;
        if (obj._lstn.constructor===Array) {
            if (obj._lstn.length===1 && obj._lstn[0]===this) {
                obj.off('',this);
                this.off(object,obj);
                obj._id = null; // dead
            }
        } // TODO {} complex _lstn
    }
};

Peer.prototype.off = function (spec,cb) {
    if (spec._id) {
        if (!cb)
            cb = spec;
        spec = spec._id;
    }
    if (!cb) throw new Error('invalid argument');
    spec = Spec.as(spec);
    
    this._off(spec.id,cb);
    if (cb._id==spec.id && cb._type)
        cb.off('',this);
    
    var ln = this._lstn[spec.id];
    if (ln && ln.length===1) { // unsubscribe from the uplink, maybe
        var up = this.findUplink(spec.id);
        if (ln[0]===up)
            up.off(spec.id,this);
    }

    if (cb._id && cb._id in this.peers) { // unsubscribe from the downlink, maybe
        if (Peer.distance(spec,cb) > Peer.distance(spec,this))  // FIXME  dist==dist
            cb.off(spec.id,this);
    }

};

Peer.prototype.set = function (spec,val,src,src2) {
    if (this._emitting && spec.toString() in this._emitting)
        return; // inf cycle safeguard
    this._emitting[spec.toString()] = true;
    spec = Spec.as(spec);
    this.emit(spec,val,src,src2);  // relay
    delete this._emitting[spec.toString()];
};

// O B J E C T  P R O T O T Y P E  H A N D L I N G

Peer.prototypes = {};

Spec.re_varname = /^[a-z][a-z0-9]*([A-Z][a-z0-9]*)*$/; // camel case

Spec.addWireName = function (name, wireName) {
    Spec.wireNames[wireName] = name;
    Spec.wireNames[name] = wireName;
    // TODO check correctness
};

Spec.giveSixCharName = function (name, quant) {
    var vocab = Spec.wireNames;
    var code = name;
    while (code.length<6)
        code = '='+code;
    if (code.length>6)
        code = code.substr(0,3) + code.substr(-3);
    for(var i=0; (code in vocab) && i<32*32; i++)
        code = code.substr(0,2) + ID.base32.charAt(i>>5) +
            ID.base32.charAt(i&31) + code.substr(-2);
    if (code in vocab) throw new Error('I did my best');
    code = (quant||'.')+code;
    return code;
};

Peer.listVariables = function (sample) {
    var ret = [];
    for (var name in sample) {
        if (name.charAt(0)==='_') continue;
        if (!sample.hasOwnProperty(name)) continue;
        if (!Spec.re_varname.test(name)) continue;
        ret.push(name);
    }
    return ret;
};

Peer.extend = function(func,name6,defaults) {
    if (name6 && name6.constructor===Object && !defaults) {
        defaults = name6;
        name6 = '';
    }
    // may introspect an empty object
    var sample = new func();
    var names = Peer.listVariables(sample);
    defaults = defaults || {};
    for(var i=0; i<names.length; i++) {
        var name = names[i];
        if (name in Spec.wireNames) continue;
        Spec.addWireName(name, defaults[name] || Spec.giveSixCharName(name,'.'));
    }
    name6 = name6 || Spec.giveSixCharName(func.name,'/');
    Spec.addWireName(func.name,name6);
    Peer.prototypes[func.name] = Peer.prototypes[name6] = func;
    var proto = func.prototype;
    proto._type = func._type = name6.toString();
    proto.isSet = false;
    // extend the prototype
    for(var i=0; i<names.length; i++) {
        var name = names[i];
        var capname = name.charAt(0).toUpperCase()+name.substr(1);
        var field = Spec.wireNames[name];
        (function def (spec,name,Name) {
            proto['set'+Name] = function (val) {
                this.set(spec,val);
            }
            proto['get'+Name] = function () {
                return this[name];
            }
        }) (field,name,capname);
    }
    for(var method in SwarmObjectProto)
        proto[method] = SwarmObjectProto[method];
    for(var method in SpecValEmitter._p)
        proto[method] = SpecValEmitter._p[method];
};

Peer.extendSet = function (func,name6) {
    name6 = name6 || Spec.giveSixCharName(func.name,'/');
    Spec.addWireName(func.name,name6);
    Peer.prototypes[func.name] = Peer.prototypes[name6] = func;
    var proto = func.prototype;
    proto._type = func._type = name6.toString();
    proto.isSet = true;
    for(var method in SwarmObjectProto)
        proto[method] = SwarmObjectProto[method];
    for(var method in SpecValEmitter._p)
        proto[method] = SpecValEmitter._p[method];
};

var SwarmObjectProto = {

    /** Apply a specval diff */
    set: function the_set (spec,val,srcref) {
        if (spec.constructor===Object && val===undefined) {
            val = spec;
            spec = '';
        }
        spec = new Spec(spec,this._type+this._id);
        svdebug(this,'set',spec,val);
        /*if (!spec.version) {
            spec.version = this._host ? this._host.createId('!') : new ID('!');
            spec.cache = ''; // FIXME automate
            srcref = this;
        }*/
        if (!spec.type)
            spec.type = this._type;
        if (spec.field) {
            var nval = {};
            nval[spec.field] = val;
            val = nval;
            spec.field = '';
            spec.cache = '';
        }
        if (!srcref && !spec.version) {
            spec.version = this._host ? this._host.createId('!') : new ID('!');
            spec.cache = '';
            srcref = this; // well...
        }
        spec.parse('$');
        for(var key in val) 
            if (!Spec.is(key)) {
                var fid = Spec.wireNames[key];
                if (!fid) 
                    throw new Error('unknown literal '+key+' in '+spec+', '+val);
                val[fid] = val[key];
            }
        var changes;
        for(var sp in val) {
            var value = val[sp];
            if (!Spec.is(sp)) continue;
            sp = new Spec(sp,spec);
            var myVersion = Spec.getPair(this._vmap,sp.field) || '';
            if ( myVersion < sp.version ) {
                if (!this.isSet) {
                    var fname = Spec.wireNames[sp.field];
                    if (!fname)
                        throw new Error('unknown field',sp);
                    this[fname] = val[fname] = value;
                } else {
                    // (3)  if  'null'  write 'undefined'
                    this[sp.field] = value;
                }
                this._vmap = Spec.setPair(this._vmap,sp.field,sp.version);
                if (this._lstn.constructor===Object)
                    this.emit(sp,val,srcref,this);
                changes = true;
            } else
                console.warn('too old');
        }
        if (changes && this._lstn.constructor===Array)
            this.emit(spec,val,srcref,this);
    },

    unset: function(spec) {
        this.set(spec,undefined);
    },

    spec: function () { return this._type + this._id; },
    base: function the_base () {
        var m = [], max = {}, ret = [];
        Spec.re_fieldVersion.lastIndex = 0;
        while (m=Spec.re_fieldVersion.exec(this._vmap)) {
            var field = m[1], bareVersion = m[2].substr(1);
            var src = bareVersion.substr(0,3);
            if (bareVersion>(max[src]||'') && bareVersion>Spec.ANCIENT_TS)
                max[src] = bareVersion;
        }
        for(var k in max)
            ret.push('$'+max[k]);
        return ret.join('') || '$000000';
    },

    /** Create a specval diff from the given version */
    diff: function the_diff (spec) {
        if (!this._vmap) return;
        var diff = {}, m=[], ret = false;
        Spec.re_fieldVersion.lastIndex = 0;
        spec = Spec.as(spec);
        if (spec.base == '$000000') {
            // full state
            while (m=Spec.re_fieldVersion.exec(this._vmap)) {
                diff[m[0]] = this[ this.isSet ? m[1] : Spec.wireNames[m[1]] ];
                ret = true;
            }
        } else {
            spec.parseBase();
            while (m=Spec.re_fieldVersion.exec(this._vmap)) {
                var fieldver=m[0], field=m[1], bareVersion=m[2].substr(1), source=bareVersion.substr(3);
                var peerBareVersion = (spec.base[source]||'$000000').substr(1); // TODO
                if ( bareVersion > peerBareVersion && bareVersion > Spec.ANCIENT_TS ) {
                    diff[fieldver] = this[ this.isSet ? field : Spec.wireNames[field] ];
                    ret = true;
                }
            }
        }
        return ret ? diff : undefined;
    }

}; // proto

//  N E T W O R K I N G

function Stub () {}
var _p = Stub.prototype;
_p.on = _p.off = _p.set = _p.peer = function(){};


function Pipe (sink,host,opts) {
    var self = this;
    opts = opts||{};
    self._id = null;
    self.sink = sink;
    self.host = host;
    self.timer = null;
    self.bundle = {};
    self.timeout = opts.timeout || -1;
    self.serialize = opts.serialize || function (obj) {
        return JSON.stringify(obj);
    };
    self.deserialize = opts.deserialize || function (str) {
        return JSON.parse(str);
    };
    sink.on('message',function onmsg(msg){
        self.parseBundle(msg.data||msg.toString()); // FIXME vocab
    });
    sink.on('close',function(reason){
        self.close();
    });
    if (!self._id) {
        var hs = {};
        hs[Spec.wireNames['Peer']+self.host._id] = '';
        self.sink.send(self.serialize(hs));
    }
    /*else {
        setTimeout(function(){
            if (self.sink && !self._id)
                self.close();
        },4000||opts.handshakeWaitTime);
    }*/
}
Spec.METHOD_ON = Spec.wireNames["on"];
Spec.METHOD_OFF = Spec.wireNames["off"];

Pipe.prototype.close = function pcl () {
    this.sink && this.sink.close();
};

Pipe.prototype.on = function pon (spec,val) {
    spec = Spec.as(spec);
    spec.method = Spec.METHOD_ON;
    spec.cache = null; // TODO sep obj
    this.set(spec,'');
};

Pipe.prototype.off = function poff (spec,val) {
    spec = Spec.as(spec);
    spec.method = Spec.METHOD_OFF;
    spec.cache = null;
    this.set(spec,'');
};

function versionSort (a,b) {
    return a.version<b.version ? 1 : (a.version===b.version?0:-1);
}

Pipe.prototype.parseHandshake = function ph (spec,specme) {
    var self = this, hs = undefined;
    spec = Spec.as(spec);
    if (spec.type != Spec.wireNames['Peer'])
        return self.close('not a handshake');
    specme = Spec.as(specme);
    if (!specme.id) {
        hs = {};
    } else if (specme.id != self.host._id) {
        var hostid = Spec.as(self.host._id).parse();
        if (hostid.ssn==0)
            self.host._id = specme.id;
        else
            return self.close('wrong door');
    }
    if (spec.parse('#').id.ssn==0) {
        spec.id.ssn = (Math.random()*(1<<15))|0; // TODO user records, max ssn
        spec.id.cache = spec.cache = ''; // :( TODO
        hs = {};
    }
    this._id = spec.id;
    this.host.addPeer(this);
    if (hs) {
        hs[ Spec.wireNames['Peer']+this.host._id ] = spec.toString();
        self.sink.send(self.serialize(hs));
    }
};

Pipe.prototype.parseBundle = function pb (msg) {
    console.log(this.host._id+' rcvs '+this._id+'',msg.toString());
    var obj = this.deserialize(msg.toString()), keys = [], spec;
    for(var key in obj)
        if (key)
            keys.push(new Spec(key));
    if (!this._id)
        return this.parseHandshake(keys[0],obj[keys[0]]); // FIXME
    keys.sort(versionSort);
    while (spec = keys.pop()) {
        if (spec.method) {
           if (spec.method==Spec.METHOD_ON)
               this.host.on(spec,this);
           else if (spec.method==Spec.METHOD_OFF)
               this.host.off(spec,this);
           else
               {}
        } else {
            var replica = this.host.findObject(spec);
            if (replica)
                replica.set(spec,obj[spec.cache],this);
        }
    }
};

Pipe.prototype.sendBundle = function pS () {
    var self = this;
    var sendStr = self.serialize(self.bundle);
    self.bundle = {};
    console.log(this.host._id+' sends '+this._id+'',sendStr);
    svdebug(this.host,' > ',this._id||'#000000',sendStr);
    if (self.sink)
        self.sink.send(sendStr);
};

Pipe.prototype.set = function ps (spec,val) {
    var self = this;
    var sendval = {};
    for(var key in val)
        if (Spec.is(key))
            sendval[key] = val[key];
    self.bundle[spec] = sendval; // TODO aggregation
    if (!self.timer) {
        if (self.timeout===-1)
            self.sendBundle();
        else
            self.timer = setTimeout(function(){
                self.sendBundle();
                self.timer = null;
            },self.timeout);
    }
};

Pipe.prototype.close = function pc () {
    if (this.sink) {
        this.sink.close();
        this.sink = null;
    }
    if (this._id) {
        this.host.removePeer(this);
        this._id = null;
    }
};

function TestSocket () {
    this.pair = null;
    this.cb = null;
    this.queued = null;
};
TestSocket.prototype.send = function tsSend (msg) {
    if (this.pair.cb)
        this.pair.cb(msg);
    else
        this.pair.queued = msg;
};
TestSocket.prototype.on = function tsOn (ev,fn) {
    if (ev=='message') {
        this.cb = fn;
        if (this.queued) {
            this.cb(this.queued);
            this.queued = null;
        }
    }
};
TestSocket.prototype.close = function () {
    this.pair = {cb: function(){
        console.error('closed');
    } };
};

function getTestSocketPair () {
    var a = new TestSocket(), b = new TestSocket();
    a.pair = b;
    b.pair = a;
    return [a,b];
};


function Plumber (host,urlList) {
    this.host = host;
    if (urlList.constructor!==Array)
        urlList = [urlList];
    this.urlList = urlList;
    this.reconnCount = {};
    this.timeouts = {};
    for(var i=0; i<urlList.length; i++)
        this.connect(urlList[i]);
};
Plumber.schemes = {};

Plumber.prototype.scheduleReconnect = function (uri) {
    var self = this;
    if (self.timeouts[uri])
        return;
    self.reconnCount[uri]=(self.reconnCount[uri]||0)+1;
    var delay = (1<<8)<<Math.min(8,self.reconnCount[uri]);
    delay = (delay*0.75 + Math.random()*delay*0.25) | 0;
    console.warn('reconnect in ',delay,'ms');
    self.timeouts[uri] = setTimeout(function(){
        delete self.timeouts[uri];
        self.connect(uri);
    },delay);
};


Plumber.prototype.connect = function (uri) {
    console.warn('connect: '+uri);
    var self = this;
    var scheme = uri.toString().match(/^(\w+):/)[1];
    var fn = Plumber.schemes[scheme];
    if (!fn)
        throw new Error('scheme unknown',uri);
    var socket = new fn (uri);
    var vocab = Plumber.schemes[scheme].eventNames || {};
    socket.addEventListener(vocab.open||'open',function(err){
        console.warn('open: '+uri);
        var pipe = new Pipe(socket,self.host,{});
        self.reconnCount[uri]=0;
    });
    socket.on(vocab.error||'error',function(err){
        console.error('sockeet error: ',uri,err);
        self.scheduleReconnect(uri);
    });
    socket.on(vocab.close||'close',function(){
        console.warn('close: '+uri);
        self.scheduleReconnect(uri);
    });
};

Peer.prototype.getPeerCount = function () {
    var ret = 0;
    for(var peer in this.peers)
        ret++;
    return ret;
};

var swarm = (typeof(module)!=='undefined'&&module.exports) || {};
swarm.Peer = Peer;
swarm.Pipe = Pipe;
swarm.ID = ID;
swarm.Spec = Spec;
swarm.Plumber = Plumber;

if (typeof(module)!=='undefined') {
    WebSocket = require('ws');
    crypto = require('crypto');
}

if (typeof(WebSocket)!=='undefined') 
    Plumber.schemes['ws'] = WebSocket;

WebSocket._p = WebSocket.prototype;
if (!WebSocket._p.on)
    WebSocket._p.on = WebSocket._p.addEventListener;
if (!WebSocket.off)
    WebSocket._p.off = WebSocket._p.removeEventListener;

/*   Pain points
 *   * base refac
 *   * Plumber: debug/test (url list, disconnects, repeated connects)
 *
 * */
    /*function expectedSecret (id) {
        var hash = crypto.createHash('sha1');
        hash.update(id.toString());
        hash.update(self.host.masterSecret);
        return hash.digest('base64');
    }*/
