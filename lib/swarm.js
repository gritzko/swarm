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
 * WebStorage key-val formats
 *  /coll#oid.key!ver  val
 *  /coll#set.oid!ver  /coll1/coll2  -- optional as oid is glob-unique
 *  /coll#doc.pid!ver  :pos string
 *
//   ObjectID: timestamp, source (author), sequence number (randomized)
//   Field may be an object id (for collections)
//   Object ID is a version id by default (create op)
 * Every ID is a version id
 * Version id: ts-src-seq, 1-3 ids, each id is 30 bits (6 base32, 4 bytes, 2 unicode chars)
 *  ts   UNIX second timestamp; epoch shifted to 1 Jan 2010
 *  src  (optional) author of the change, simply some account id
 *  seq  (optional) sequence number of the change; to assign multiple ids within a second
 *
 *  Unicode:  !tssrse !tssr !ts (same length ids, alphanum sortable)
 *  Base32:   !ts-src-seq (variable length ids, not sortable)
 *  Base32-6: !aaaats-aaasrc-aaaseq (const length ids, sortable)
 *  
 *  Field/collection name restrictions:
 *   paymntDue getPaymentDue() - decorate
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

/* the mice example
    mice_ssn = new Mice(ssn)
/mice#ssn+open
    mice_ssn.setX(20);
    // c: mice_ssn.x = 20;
    // c: mice_ssn.onX(20);
    // c: for(var e in mice_ssn.events['x']) e(20);
/#!ts@ssn+set,x 20
    // s: mice_ssn.x = 20;
/#!@+,y 20
    var stub = new Stub('/misc/roster');    // sep log syncd on every pipe opend
    stub.invoke('set',ssn,'on');
/misc#roster!ts@ssn+set,ssn  'on'
*/

/**      O P E N  T O D O S
 *
 *    v. loopless synch protocol
 *    1. alphanumeric vid order         OK  (TODO uni)
 *    2. Peer.set => storage
 *    3. on => diff
 *    4. collection
 *      4.1 diff/set
 *      4.2 Array compat (SortedSet)
 *    5. address, PEX
 *
 * */

//  I D  F O R M A T S :  U N I C O D E,  B A S E 3 2,  N U M E R I C
//
//   *peer/objectSet#objectName.field_name!version
//
//   /coll-src-seq#obj-src-seq.field-src-seq!ts-src-seq
//

//  S W A R M  S P E C I F I E R S
var Spec = {
    _int2uni : function (i) {
        return String.fromCharCode( (i>>15)+0x30, (i&0x7fff)+0x30 );
    },
    _uni2int : function(u) {
        return ((u.charCodeAt(0)-0x30)<<15) + (u.charCodeAt(1)-0x30);
    },
    _int2base : function (i,capitalize) {
        var ret = [];
        for (; i; i>>=5) 
            ret.push(Spec.base32.charAt(i&31));
        if (!ret.length)
            ret.push('2');
        if (capitalize)
            ret.push(ret.pop().toUpperCase());
        return ret.reverse().join('');
    },
    _base2int : function (b32) {
        var val = 0;
        for(var p=0; p<b32.length; p++) {
            val<<=5;
            val|=Spec.base32.indexOf(b32.charAt(p));
        }
        return val;
    },
    _uni2base : function (uni,capitalize) {
        return Spec._int2base(Spec._uni2int(uni),capitalize);
    },
    _base2uni : function (base) {
        return Spec._int2uni(Spec._base2int(base));
    },
    /** Three base32 capitalization forms: ClassName, methodName, field_name.
        Regular ids are always serialized as 'any-id'; camelCase is reserved
        for class and method names, under_scores for field names.  */
    parse32 : function (base32) {
        base32 = base32.replace(/([a-z2-7])([A-Z])/g,'$1-$2');
        base32 = base32.replace(/_/g,'-');
        base32 = base32.toLowerCase();
        Spec.re_syl_32_g.lastIndex = 0;
        var m=[], ret=[];
        while (m=Spec.re_id_32_g.exec(base32)) {
            var q=m[1], ts=m[2], seq=m[3]||'2', src=m[4]||'2';
            ret.push(q,Spec._base2uni(ts),Spec._base2uni(seq),Spec._base2uni(src));
        }
        return ret.join('');
    },
    to32 : function (uni) {
        Spec.re_id_uni_g.lastIndex = 0;
        var m = [], ret = [];
        while (m=Spec.re_id_uni_g.exec(uni)) {
            var quant=m[1], ts=m[2], seqssn=m[3]+m[4], src=m[5];
            var cml='/+'.indexOf(quant)!==-1;
            ret.push(quant,Spec._uni2base(ts,quant==='/'));
            if (seqssn!=='00')
                ret.push(cml?'':'-',Spec._uni2base(seqssn,cml));
            if (src!=='00')
                ret.push(cml?'':'-',Spec._uni2base(src,cml));
        }
        return ret.join('');
    },
    filter : function (spec,pattern) {
        var p = pattern.match(/./g);
        var toks = spec.match(Spec.re_id_uni_g);
        return toks.filter(function(tok) {
            return p.length && tok.charAt(0)===p[0] && p.shift();
        });
        /*return spec.replace(Peer.re_id_g,function(m,quant){
            return pattern.indexOf(quant!==-1);
        });*/
    },
    get : function (spec,quant) {
        var start = spec.indexOf(quant); // voila
        if (start===-1) return '';
        Spec.re_id_uni_g.lastIndex = start;
        return Spec.re_id_uni_g.exec(spec)[0];
    },
    pattern : function (spec) {
        return spec.replace(Spec.re_id_uni_g,'$1');
    },
    parseId : function (id) {
        Spec.re_id_uni_g.lastIndex = 0;
        var m = Spec.re_id_uni_g.exec(id);
        if (!m) return null;
        return {
            quant: m[1] || '?',
            ts:    m[2],
            seq:   m[3],
            ssn:   m[4],
            src:   m[5]
        };
    },
    randomSyl : function () {
        var max = (1<<30)-1, mid = (1<<15)-1, min=0x30;
        var val = (Math.random()*max)&max;
        return String.fromCharCode(min+(val&mid),min+(val>>15));
    },
    uni2map: function (spec,quants) {
        Spec.re_id_uni_g.lastIndex = 0;
        var m = [], ret = {}, keyq=quants.charAt(0),
            valq=quants.charAt(1), key=null;
        while (m=Spec.re_id_uni_g.exec(spec)) {
            if (m[1]===keyq)
                key = m[0];
            else if (m[1]===valq)
                ret[key] = m[0];
        }
        return ret;
    },
    uni2srcmap: function (spec,quant) {
        Spec.re_id_uni_g.lastIndex = 0;
        var m = [], ret = {};
        while (m=Spec.re_id_uni_g.exec(spec)) {
            if (quant && m[1]!=quant) continue;
            if (m[0]>(ret[m[5]]||''))
                ret[m[5]] = m[0];
        }
        return ret;
    },
    mapset: function(spec,keyTok,valTok) {
        var split = spec.match(Spec.re_id_uni_g)||[];
        var i = split.indexOf(keyTok);
        if (i===-1)
            return spec+keyTok+valTok;
        split[i+1] = valTok;
        return split.join('');
    },
    mapval2uni: function (map) {
        var ret = [];
        for(var key in map)
            ret.push(map[key]);
        return ret.join('');
    }

};

{
    /** RFCXXX base32 encoding; it is somewhat more readable than
     *  Unicode hierogliphs, may be used in URLs etc.*/
    Spec.base32 = '234567abcdefghijklmnopqrstuvwxyz';
    Spec.rs_base32 = '[a-z2-7]{1,6}';
    Spec.rs_uni = '[0-\\u802f]{2}';
    Spec.rs_syl_32 = '([!-\\/])($B)'.replace(/\$B/g,Spec.rs_base32);
    Spec.re_syl_32_g = new RegExp(Spec.rs_syl_32,'g');
    Spec.rs_id = '([!-,\\.\\/])($B)(?:\\-($B)(?:\\-($B))?)?';
    Spec.rs_id_32 = Spec.rs_id.replace(/\$B/g,Spec.rs_base32);
    Spec.re_id_32_g = new RegExp(Spec.rs_id_32,'g');
    Spec.rs_id_uni = '([!-,\\.\\/])($I{2})($I)($I)($I{2})'.replace(/\$I/g,'[0-\\u802f]');
    Spec.re_id_uni_g = new RegExp(Spec.rs_id_uni,'g');
    Spec.re_id_uni = new RegExp(Spec.rs_id_uni,'');
    Spec.re_key_ver = '(\\.$T)(!$T)'.replace(/\$T/g,Spec.rs_id_uni);
}


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
    return this.cache ||
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

function Spec2 (spec) {
    var m = spec!==''?spec.match(ID.re_id_g):[], tok;
    if (!m || spec.length!=m.length*7)
        throw new Error('malformed specifier',spec);
    this.type = this.oid = this.field = this.key = 
        this.method = this.version = this.base = '';
    this.cache = spec;
    while (tok=m.pop()) {
        switch (tok.charAt(0)) {
            case '/': this.type=tok; break;
            case '#': this.oid=tok; break;
            case '.': this.field=tok; break;
            case ',': this.key=tok; break;
            case '\'': this.method=tok; break;
            case '!': this.version=tok; break;
            case '$': this.base+=tok; break; // ^2
            default: throw new Error('unknown quant',id.q);
        }
    }
}

Spec2.as = function (spec,defQuant) {
    if (spec.constructor===Spec2)
        return spec;
    if (spec.toString().match(ID.re_id_g))
        return new Spec2(spec.toString());
    return new Spec2(ID.parse32(defQuant,spec).toString());  // TODO ugly
};

Spec2.is = function (str) {
    return str.constructor===Spec2 || str.toString().match(ID.re_id_g);
}

Spec2.getPair = function (str,key) {
    str = str || '';
    var i = str.indexOf(key);
    return i===-1 ? '' : str.substr(i+7,7);
};

Spec2.setPair = function (str,key,val) {
    var i = str.indexOf(key);
    if (i===-1) return str+key+val;
    return str.substr(0,i) + key + val + str.substr(i+14);
};

Spec2.maxVersions = function (specstr,quant) {
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

Spec2.prototype.parseBase = function () {
    if (this.base.constructor!==String) return;
    ID.re_id_g.lastIndex = 0;
    var m = [], res = {};
    while (m=ID.re_id_g.exec(this.base))
        ret[m[4]+m[5]] = m[0];
    this.base = res;
};

Spec2.prototype.parse = function (quants) {
    var qlist = quants.match(/./g), quant;
    while (quant=qlist.pop()) {
        if (quant=='$') {
            this.parseBase();
            continue;
        }
        var i = Spec2.quants.indexOf(quant);
        var name = Spec2.order[i];
        if (this[name].constructor===ID) return this[name];
        return this[name] = new ID(this[name]);
    }
};

Spec2.prototype.toString = function () {
    if (this.cache) return this.cache;
    var ret = [];
    for(var i=0; i<ord.length; i++)
        if (v) ret.push(this[ord[i]].toString());
    return this.cache = ret.join('');
};

/** debugging only! */
Spec2.prototype.toString32 = function () {
    var ret = [], ord=Spec2.order;
    for(var i=0; i<ord.length; i++) {
        var v = this[ord[i]];
        if (!v) continue;
        if (typeof(v)==='string') this[ord[i]] = v = new ID(v);
        ret.push( v.q, v.toString32() );
    }
    return ret.join('');
};
Spec2.order = ['type','oid','field','key','method','version','base'];
Spec2.quants = '/#.,\'!$';


function SpecValEventEmitter () {
    this._lstn = {};
}
SpecValEventEmitter.tokList = ['type','method','oid','field'];

SpecValEventEmitter.prototype.on = function (spec,fn) {
    if (!this._lstn)
        this._lstn = spec ? {} : [];
    if (!spec && this._lstn.constructor===Array) {
        this._lstn.push(fn); // no filtering
        return;
    }
    var key = Spec2.as(spec,this._defQuant).toString();
    if (key.length>7) throw new Error('need an empty or a single token spec');
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

SpecValEventEmitter.prototype.off = function (spec,fn) {
    if (this._lstn.constructor===Array) {
        this._lstn.splice(this._lstn.indexOf(fn),1);
    } else {
        var key = Spec2.as(spec,this._defQuant).toString();
        if (key.length!==7) throw new Error('one-token spec only');
        var lstn = this._lstn[key];
        if (lstn.constructor===Array)
            lstn.splice(lstn.indexOf(fn),1);
        else
            delete this._lstn[key];
    }
};

SpecValEventEmitter.prototype.emit = function (spec,val) {
    if (!this._lstn) return;
    var listeners=[], lstn;
    if (this._lstn.constructor===Array) {
        listeners = this._lstn;
    } else {
        listeners = listeners.concat(this._lstn['']);
        spec = Spec2.as(spec,this._defQuant);
        var tl = SpecValEventEmitter.tokList;
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
    for (var j=0; j<listeners.length; j++) {
        lstn = listeners[j];
        if (lstn.constructor===Function)
            lstn(spec,val);
        else
            lstn.set(spec,val);
    }
};

/**
 *
 * */
function Peer (id) {
    if (id.constructor===String)
        id = new ID(id);
    this.id = id;
    this.peers = {};
    this.objects = {};
    this.hashes = Peer.hashRing(this.id);
    this.storage = new Stub();
}

Peer.prototype.close = function () { // TODO think... 
    for(var pid in this.peers)
        this.peers[pid].off('',this);
    //for(var oid in this.objects)
    //    this.objects[oid].off();
    delete this.objects;
};

if (typeof(module)!=='undefined') {
    module.exports = Peer;
    Peer.Spec = Spec;
}


// T I M E,  O B J E C T  A N D  V E R S I O N  I D S


Peer.createObject = function (spec) {
    spec = Spec2.parse(spec);
    if (!spec.type || !spec.oid)
        throw new Error('malformed specifier',spec);
    spec.parse('/');
    var proto_fn = Peer.prototypes[spec.type.toString32()];
    if (!proto_fn)
        throw new Error('prototype unknown: ',spec);
    obj = new proto_fn(spec.oid);
    return obj;
};

// P E E R S,  U P L I N K S,  C O N S I S T E N T  H A S H I N G
var salts = [''];

Peer.hashRing = function (id) {
    var ring = [];
    for(var i=0; i<salts.length; i++)
        ring.push(Peer.hash(id+salts[i]));
    return ring;
};

/** Note. Use collection peers to track the swarm; the first
 * connected peer is likely the uplink; uplink switches a lot
 * as the peer keeps connecting - this way we test our
 * failover algorithms at each start-connect cycle. */
Peer.prototype.addPeer = function (peer) {
    var self = this;
    // TODO RAFAC
    if (peer.constructor===Peer)
        throw new Error('cannot connect peers directly');
    if (peer.constructor===String) // URL
        peer = new RemotePeer(peer); // TODO async?
    var pid = peer.id;
    if (pid in self.peers)
        throw new Error('peer was already added: '+pid);
    self.peers[pid] = peer;
    if (!peer.hashes)
        peer.hashes = Peer.hashRing(peer.id);
    // /TODO REFAC
    
    peer.on(Spec2.METHOD_ON,function(spec,val){
        this.on(spec,val,peer);
    });
    peer.on(Spec2.METHOD_OFF,function(spec,val){
        this.off(spec,val,peer);
    });
    // peer.on(oid,obj);

    // this.pexes.set(pid,url);
    //    redistribute load to the new peer
    for(var oid in self.objects) {
        var obj = self.objects[oid];
        var newup = this.findUplink(oid), oldup;
        if (newup===peer) {
            if (oldup === this.findUplink(oid,newup))
                obj.off('',oldup);
            obj.on('',newup);
        }
    }
};

Peer.prototype.removePeer = function (peer) {
    var pid = peer.constructor===String ? peer : peer.id;
    peer = this.peers[pid];
    if (!peer)
        throw new Error('peer unknown: '+pid);
    for(var oid in this.objects) {
        var obj = this.objects[oid];
        var oldup = this.findUplink(oid), newup;
        if (oldup===peer) {
            if (newup = this.findUplink(oid,oldup))
                obj.on('',newup);
            obj.off('',offup); // Ypa!
        }
    }
    delete this.peers[pid];
};

Peer.hash = function (str) {
    if (str.length<4)
        str = str+str;
    var res = 0, len = str.length;
    for (var i = 0; i < len; i++)
        res = res * 31 + str.charCodeAt(i);
    return res&0x7fffffff;
};

Peer.objectPeerDistance = function (hash,peer) {
    if (hash._id)
        hash = hash._id;
    if (hash.length)
        hash = Peer.hash(hash);
    peer = peer || this;
    var hashes = peer.hashes ? peer.hashes : Peer.hashRing(peer);
    var minDist = 0x7fffffff;
    for(var i=0; i<hashes.length; i++)
        if ( (hashes[i]^hash) < minDist )
            minDist = hashes[i]^hash;
    return minDist;
};

Peer.prototype.findUplink = function (obj,except) {
    var nopid = except ? except.id || except : '';
    var minDist = Peer.objectPeerDistance(obj,this),
        minPeer = this.storage;
    for(var pid in this.peers) {
        if (pid===nopid) continue;
        var peer = this.peers[pid];
        var dist = Peer.objectPeerDistance(obj,peer);
        if (minDist>=dist) 
            if (minDist>dist || peer.id<this.id) {
                minDist = dist;
                minPeer = peer;
            }
    }
    return minPeer;
};

//  P E E R'S  3 - M E T H O D  I N T E R F A C E

Peer.prototype.createOid = function () {
    return new ID('#',this.id.src,this.id.ssn);
};

Peer.prototype.on = function (def,listener) {
    var obj, spec, oid, fn;
    // make sense of the arguments
    if (def.constructor===String && Spec2.is(def))
        def = new Spec2(def);
    switch (def.constructor) {
        case String:    fn = Peer.prototypes[def]; break;
        case Spec2:     fn = Peer.prototypes[def.parse('/').toString32()];
                        oid = def.oid; break;
        case ID:        oid = def; break;
        case Function:  fn = def;  break;
        default:        obj = def; oid = def._id; break;
    }
    // get/create the object   TODO fast lane
    if (!obj && oid)
        obj = this.objects[oid];
    if (!oid)
        oid = this.createOid();
    if (!obj && fn)
        obj = new fn (oid);
    if (!obj)
        throw new Error('cannot understand you');
    if (!Peer.prototypes[obj.constructor.name])
        throw new Error('unknown type');
    if (!obj._id)
        obj._id = oid;
    if (obj!==this.objects[oid]) {
        if (oid in this.objects) throw new Error('collision');
        this.objects[oid] = obj;
        obj._vmap = obj._vmap || '';
        obj._lstn = [];
        var up = this.findUplink(obj);
        up.on(obj._id,obj); // no base
    }
    if (listener) {
        obj.on(spec,listener);
        var isPeer = listener._id && listener._id.charAt(0)==='*';
        if ( isPeer && listener!==this.findUplink(obj) ) // reciprocal listen
            listener.on(obj._id+obj.base(),obj);
    } else {
        ; // note this object is not live FIXME load only 
    }
    return obj;
};

Peer.prototype.off = function (spec,cb) {
    if (spec._id)
        spec = spec._id;
    spec = Spec2.as(spec);
    var obj = this.objects[spec.oid];
    if (!obj) throw new Error('object unknown');
    if (!cb) throw new Error('invalid argument');
    obj.off('',cb);
    var isPeer = cb._id && cb._id.charAt(0)==='*';
    if (isPeer)
        cb.off(obj._id,obj);
    // distributed GC: if peer was a listener on the object => remove
    if (obj._lstn.length===1 && obj._lstn[0]===this.findUplink(obj))
        obj.off('',obj._lstn[0]);
    if (!obj._lstn.length)
        delete this.objects[obj._id]; // go gc
};

Peer.prototype.set = function (spec,val) {
    spec = Spec2.as(spec);
    var obj = this.objects[spec.oid];
    if (!obj) throw new Error('no such object');
    obj.set(spec,val);
};

// O B J E C T  P R O T O T Y P E  H A N D L I N G

Peer.prototypes = {};

Peer.extend = function(func,name) {
    name = name || func.name;
    var tid = ID.parse32('/',name);
    if (tid.toString32()!==name)
        throw new Error('not a base32 name',name);
    Peer.prototypes[name] = func;
    var proto = func.prototype;
    proto._fields = []; // compare to {}
    proto._field2name = {};
    proto._tid = tid;
    proto._defQuant = '.';
    // introspect an empty object
    var sample = new func();
    for (var f in sample) {
        if (f.charAt(0)==='_') continue;
        if (!sample.hasOwnProperty(f)) continue;
        var id = ID.parse32('.',f), capcheck=id.toString32();
        if (f!==capcheck)
            throw new Error('malformed base32 name',f);
        proto._fields.push(f);
        proto._field2name[id] = f;
        var capname = f.charAt(0).toUpperCase()+f.substr(1);
        (function def (spec,name,Name) {
            proto['set'+Name] = function (val) {
                this.set(spec,val);
            }
            proto['get'+Name] = function () {
                return this[name];
            }
        }) (id,f,capname);
    }
    // extend the prototype
    for(var method in SwarmObjectProto)
        proto[method] = SwarmObjectProto[method];
    for(var method in SpecValEventEmitter.prototype)
        proto[method] = SpecValEventEmitter.prototype[method];
};

var SwarmObjectProto = {

    /** Apply a specval diff */
    set: function the_set (spec,val,srcref) {
        if ( spec==='' || (spec.constructor===Spec2 && spec.field==='') ) {
            for (var s in spec)
                if (s.charAt(0)!='_')
                    this.set(s,spec[s],srcref);
        } else if (Spec2.is(spec)===false) {
            this.set(ID.parse32('.',spec),val,srcref);
        } else {
            spec = Spec2.as(spec,'.');
            spec.version = spec.version || new ID('!');
            spec.parse('$.');
            var hasVersion = Spec2.getPair(this._vmap,spec.field);
            if ((hasVersion||'') < spec.version) {
                var fname = spec.field.toString32();
                this[fname] = val;
                this._vmap = Spec2.setPair(this._vmap,spec.field,spec.version);
                this.emit(spec,val,srcref);
            } else
                console.warn('too old');
        }
    },

    /** Notify listeners of a change 
    emit: function the_trigger (spec,val,from) {
        for(var i=0; i<this._lstn.length; i++) {
            var l = this._lstn[i];
            if (l===from) continue;
            if (typeof(l)==='function')
                l(spec,val,this);
            else
                l.set(spec,val,this); // TODO filters
        }
    },*/

    base: function the_base () {
        return Spec.maxVersions(this._vmap);
    },
    toid: function () { return this._tid+this._id; },

    /** Create a specval diff from the given version */
    diff: function the_diff (spec,diff) {
        spec = Spec2.as(spec);
        spec.parseBase();
        var versions = this._vmap.match(Spec.re_id_g).reverse(), field;
        while (field=versions.pop()) {
            var version = versions.pop(), source = version.substr(4); // BAD
            if ( version > (spec.base[source]||'') ) {
                diff = diff || {_id: this._id};
                diff[field+version] = this[this._field2name[field]];
            }
        }
        return diff;
    },

    /*on: function the_on (spec,listener) {
        if (typeof(spec)==='function') {
            listener = spec;
            spec = '';
        }
        if (this._lstn.indexOf(listener)!==-1)
            return;
        this._lstn.push(listener);
        var isFn = listener.constructor===Function, diff;
        if ( !isFn && (diff=this.diff(spec)) )
            listener.set(this._id,diff,this);
    },

    off: function the_off (nothing,listener) {
        var i = this._lstn.indexOf(listener);
        if (i===-1) 
            throw new Error('listener unknown');
        this._lstn.splice(i,1);
    }*/

}; // proto

//  N E T W O R K I N G

function Stub () {}
var _p = Stub.prototype;
_p.on = _p.off = _p.set = _p.peer = function(){};


function Pipe (id,sink,listener,opts) {
    var self = this;
    opts = opts||{};
    self.id = id;
    self.sink = sink;
    self.listener = listener;
    self.timer = null;
    self.bundle = {};
    self.timeout = opts.timeout || -1;
    self.serialize = function (obj) { return JSON.stringify(obj); };
    self.deserialize = function (str) { return JSON.parse(str); };
    self.sink.on('message',function(msg){
        self.parseBundle(msg);
    });
}
Spec2.METHOD_ON = ID.parse32(',','on');
Spec2.METHOD_OFF = ID.parse32(',','off');

Pipe.prototype.on = function (spec,val) {
    spec = Spec2.as(spec);
    spec.method = Spec2.METHOD_ON;
    this.set(spec,val);
};

Pipe.prototype.off = function (spec,val) {
    spec = Spec2.as(spec);
    spec.method = Spec2.METHOD_OFF;
    this.set(spec,val);
};

function versionSort (a,b) {
    return a.version<b.version ? 1 : (a.version===b.version?0:-1);
}

Pipe.prototype.parseBundle = function (msg) {
    var obj = this.deserialize(msg.toString()), keys = [], spec;
    for(var key in obj)
        if (key)
            keys.push(new Spec2(key));
    keys.sort(versionSort);
    while (spec = keys.pop())
        this.listener(spec,obj[spec.cache]);
};

Pipe.prototype.sendBundle = function () {
    self.sink.send(self.serialize(self.bundle));
    self.bundle = {};
};

Pipe.prototype.set = function (spec,val) {
    var self = this;
    self.bundle[spec] = val;
    if (self.timeout===-1)
        self.sendBundle();
    else if (!self.timer)
        self.timer = setTimeout(function(){
            self.sendBundle();
            self.timer = null;
        },self.timeout);
};

function TestSocket (id) {
    this.pair = null;
    this.id = id;
    this.cb = null;
};
TestSocket.prototype.send = function (msg) {
    this.pair.cb(msg);
};
TestSocket.prototype.on = function (fn) {
    this.cb = fn;
};

function getTestSocketPair (ida,idb) {
    var a = new TestSocket(ida), b = new TestSocket(idb);
    a.pair = b;
    b.pair = a;
    return [a,b];
};


//  N E T W O R K I N G
/*var WebSocket = require('ws');
var WebSocketJsonSeDever = WebSocket.Server;
//  FIXME move
Peer.listen = function (address) {
    var self = this;
    self.server = new WebSocketJsonSeDever(address);
    Peer.server.on('connection', function (conn) {
        self.onPeerConnected(conn);
    });
};*/

/*
function RemotePeer (id,ws) {
    this.id = id;
    var ws = new WebSocket(address);
    this.ws = ws;  // TODO buffer
    this.ackd = {};
    ws.id = id;   var newPeer = new RemotePeer(id,ws);
    ws.peer = newPeer;
    ws.on('close',function(conn){
        self.onPeerDisconnected(ws);
    });
    ws.on('message',function(msg){
        self.onPeerMessage(msg);
    });
}

RemotePeer.prototype.on = function(id,cb) {
	var lstn = this.lstn[id];
	if (!lstn) {
		lstn = this.lstn[id] = [];
		this.ws.send({open:id});
	}
	lstn.push(cb);	
};

RemotePeer.prototype.set = function(diff) {
    this.ws.send({diff:diff}); // TODO filter by this.ackd[]
};

RemotePeer.prototype.off = function (id,cb) {
	var lstn = this.lstn[id];
	if (!lstn) return;
	var i = lstn.indexOf(cb);
	if (i===-1) return;
	lstn.splice(i,1);
	if (!lstn.length) {
		delete this.lstn[id];
		this.ws.send({close:id});
	}
};*/
