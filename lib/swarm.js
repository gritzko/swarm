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
 *    2. Peer.apply => storage
 *    3. on => diff
 *    4. collection
 *      4.1 diff/apply
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
        while (m=Spec.re_syl_32_g.exec(base32))
            ret.push(m[1]==='-'?'':m[1],Spec._int2uni(Spec._base2int(m[2])));
        return ret.join('');
    },
    to32 : function (uni) {
        Spec.re_id_uni_g.lastIndex = 0;
        var m = [], ret = [];
        while (m=Spec.re_id_uni_g.exec(uni)) {
            var quant=m[1], ts=m[2], src=m[3], seq=m[4];
            var cml='/+'.indexOf(quant)!==-1;
            ret.push(quant,Spec._uni2base(ts,quant==='/'));
            if (src)
                ret.push(cml?'':'-',Spec._uni2base(src,cml));
            if (seq)
                ret.push(cml?'':'-',Spec._uni2base(seq,cml));
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
            src:   m[3] || '00',
            seq:   m[4] || '00'
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
            if (m[0]>(ret[m[3]]||''))
                ret[m[3]] = m[0];
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
    Spec.rs_id_uni = '([!-,\\.\\/])($c)($c)?($c)?'.replace(/\$c/g,'[0-\\u802f]{2}');
    Spec.re_id_uni_g = new RegExp(Spec.rs_id_uni,'g');
    Spec.re_key_ver = '(\\.$T)(!$T)'.replace(/\$T/g,Spec.rs_id_uni);
}

/**
 *
 * */
function Peer (src,ssn) {
    src = src || 0; // 00 is a peer, xx is a replica (browser)
    if (typeof(src)==='string')
        src = Spec._uni2int(src);
    ssn = ssn || 0;
    if (typeof(ssn)==='string')
        ssn = Spec._uni2int(ssn);
    this.src = Spec._int2uni(src|ssn);
    // TODO last 4 bits of src is ssn
    this.id = this.createId('*',null,this.src);
    this.lastTs = this.lastSsn = 0;
    this.peers = {};
    this.objects = {};
    this.hashes = Peer.hashRing(this.id);
    this.storage = new Stub();
}

Peer.prototype.close = function () { // TODO 
    for(var oid in this.objects) {
        var obj = this.objects[oid];
        //while(obj._lstn.length>1)
        //    obj.off('',obj._lstn[obj._lstn.length-1]);
    }
};

if (typeof(module)!=='undefined') {
    module.exports = Peer;
    _ = require('underscore');
}


// T I M E,  O B J E C T  A N D  V E R S I O N  I D S

var SWARM_EPOCH = 1262275200; // 1 Jan 2010 (seconds)

Peer.prototype.createId = function (quant,ts,src,seq) {
    quant = quant || '!';
    if (!ts)
        ts = ((new Date().getTime()/1000)|0) - SWARM_EPOCH;
    if (typeof(ts)==='number')
        ts = Spec._int2uni(ts);
    src = src || this.src;
    if (typeof(src)==='number')
        src = Spec._int2uni(src);
    if (ts!==this.lastTs) {
        this.lastTs = ts;
        this.lastSeq = 0;
    }
    seq = seq || this.lastSeq++;
    if (typeof(seq)==='number')
        seq = Spec._int2uni(seq);
    return  quant + ts + ( seq!=='00' ? src+seq : (src!=='00'?src:'') );
};

Peer.prototype.createOid = function (proto) {
    var type = typeof(proto);
    if (type==='function')
        proto = proto.name;
    else if (type==='object')
        proto = proto.constructor.name;
    else if (type!=='string')
        throw new Error('proto must be either a function or its name');
    var coll = Spec.parse32('/'+proto);
    if (!coll)
        throw new Error('malformed prototype name '+proto);
    var test = Spec.to32(coll+this.createId('#'));
    return coll+this.createId('#');
};

Peer.createObject = function (oid) {
    var m = Spec.filter(oid,'/#');
    if (!m)
        throw 'malformed object id';
    var proto = m[0],
        id = m[1],
        oid = proto+id,
        fname = Spec.to32(proto);
    var proto_fn = Peer.prototypes[fname];
    if (!proto_fn)
        throw new Error('prototype unknown: '+fname);
    obj = new proto_fn(oid);
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
    if (peer.constructor===Peer)
        throw new Error('cannot connect peers directly');
    if (peer.constructor===String) // URL
        peer = new RemotePeer(peer); // TODO async?
    var pid = peer.id;
    if (pid in self.peers)
        throw 'peer was already added: '+pid;
    self.peers[pid] = peer;
    if (!peer.hashes)
        peer.hashes = Peer.hashRing(peer.id);
    // this.pexes.set(pid,url);
    //    redistribute load to the new peer
    for(var oid in self.objects) {
        var obj = self.objects[oid];
        var oldDist = Peer.objectPeerDistance(obj);
        var newDist = Peer.objectPeerDistance(obj,peer);
        if (newDist<oldDist)
            if (obj._lstn.length)
                obj.off('',obj._lstn[0]); // no longer an uplink
    }
};

Peer.prototype.removePeer = function (peer) {
    var pid = peer.constructor===String ? peer : peer.id;
    var peer = this.peers[pid];
    if (!peer)
        throw new Error('peer unknown: '+pid);
    delete this.peers[pid];
    for(var oid in this.objects) {
        var obj = this.objects[oid];
        if (obj._lstn.indexOf(peer)!==-1)
            obj.off('',peer);
    }
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

Peer.prototype.findUplink = function (obj) {
    var minDist = Peer.objectPeerDistance(obj,this),
        minPeer = this.storage;
    for(var pid in this.peers) {
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

Peer.prototype.on = function (def,listener) {
    var obj, spec, oid;
    if (def.constructor===Function) {
        spec = this.createOid(def);
    } else if (def.constructor===String) {
        spec = def;
    } else {
        if (!Peer.prototypes['/'+def.constructor.name])
            throw new Error('prototype unknown');
        obj = def;
        if (!obj._id)
            obj._id = this.createOid(obj);
        if (obj._host && obj._host!==this)
            throw new Error('the object has a host');
        spec = def._id;
    }
    if (spec && !obj) {
        oid = Spec.filter(spec,'/#').join('');
        if (oid in this.objects)
            obj = this.objects[oid];
        else 
            obj = Peer.createObject(oid);
    }
    obj._host = this;
    obj._vmap = obj._vmap || '';
    if (!this.objects[obj._id])
        this.objects[obj._id] = obj;
    if (listener)
        obj.on(spec,listener);
    // FIXME else what? 
    return obj;
};

Peer.prototype.off = function (obj,cb) {
    if (obj.constructor===String)
        obj = this.objects[obj];
    if (cb)
        obj.off('',cb);
    // distributed GC: if peer was a listener on the object => remove
    if (!obj._lstn.length) {
        obj._host = undefined;
        delete this.objects[obj._id]; // go gc
    }
};

Peer.prototype.apply = function (spec,val) {
    var oid = Spec.filter(spec,'/#').join('');
    var obj = this.objects[oid];
    if (!obj)
        return;
    obj.apply(spec,val);
};

// O B J E C T  P R O T O T Y P E  H A N D L I N G

Peer.prototypes = {};

Peer.extend = function(func) {
    // FIXME re_id
    Peer.prototypes['/'+func.name] = func;
    var proto = func.prototype;
    proto._fields = []; // compare to {}
    var sample = new func();
    for (var f in sample)
        if (f.charAt(0)!=='_' && sample.hasOwnProperty(f))
            proto._fields.push(f);
    for(var method in SwarmObjectProto)
        proto[method] = SwarmObjectProto[method];
};

var SwarmObjectProto = {

    /** Apply a specval diff */
    apply: function the_apply (spec,val,from) {
        if (typeof(spec)==='object' && !spec.length) { // bundle
            for (var s in spec)
                if (s.charAt(0)!='_')
                    this.apply(s,spec[s]);
        } else {
            var version = Spec.get(spec,'!');
            var field = Spec.get(spec,'.');
            var vmap = Spec.uni2map(this._vmap,'.!');
            if ((vmap[field]||'') < version) {
                var fname = Spec.to32(field).substr(1);
                this[fname] = val;
                this._vmap = Spec.mapset(this._vmap,field,version);
                this.trigger(spec,val,from);
            }
        }
    },

    /** Notify listeners of a change */
    trigger: function the_trigger (spec,val,from) {
        for(var i=0; i<this._lstn.length; i++) {
            var l = this._lstn[i];
            if (l===from) continue;
            if (typeof(l)==='function')
                l(spec,val,this);
            else
                l.apply(spec,val,this); // TODO filters
        }
    },

    vmax: function the_vmax () {
        return Spec.mapval2uni(Spec.uni2srcmap(this._vmap,'!'));
    },

    /** Create a specval diff from the given version */
    diff: function the_diff (vmaxmap,diff) {
        if (vmaxmap.constructor===String)
            vmaxmap = Spec.uni2srcmap(vmaxmap,'!'); // {} ~ send all
        var myvmap = Spec.uni2map(this._vmap,'.!');
        for(var key in myvmap) {
            var myver = myvmap[key], p=Spec.parseId(myver);
            if ((vmaxmap[p.src]||'') < myver) {
                var spec = key + myver;
                diff = diff || {_id: this._id};
                var fname = Spec.to32(key).substr(1);
                diff[spec] = this[fname];
            }
        }
        return diff;
    },

    set: function the_set (spec,value) {
        if (/[\w_]+/.test(spec)) { // simply a field name
            var vid = this._host.createId('!');
            var fid = Spec.parse32('.'+spec);
            spec = this._id + fid + vid;
        }
        this.apply(spec,value);
    },

    linkup: function linkup () {
        var up = this._host.findUplink(this._id);
        var i = this._lstn.indexOf(up);
        if (i===0) return; // like it should be
        if (i>1)
            this._lstn.splice(i,1);
        this._lstn.unshift(up);
        if (i===-1)
            up.on(this._id+this.vmax(),this);
    },

    on: function the_on (vmax,listener) {
        if (!this._lstn || !this._lstn.length) {
            this._lstn = [];
            this.linkup();
        }
        if (typeof(vmax)==='function') {
            listener = vmax;
            vmax = undefined;
        }
        if (this._lstn.indexOf(listener)===-1)
            this._lstn.push(listener);
        if (vmax!==undefined) {
            var vmaxmap = Spec.uni2srcmap(vmax,'!');
            var diff = this.diff(vmaxmap);
            if (diff)
                listener.apply(this._id,diff,this);
            var mymaxmap = Spec.uni2srcmap(this._vmap,'!');
            for(var src in vmaxmap)
                if (vmaxmap[src]>(mymaxmap[src]||'')) {
                    // so do open-back to pull from the downlink
                    listener.on(this._id+this.vmax(),this);
                    break;
                }
        }
    },

    off: function the_off (nothing,listener) {
        var i = this._lstn.indexOf(listener);
        if (i>0) {
            this._lstn.splice(i,1);
            if (this._lstn.length===1) {
                this._lstn.shift().off(this._id,this);
                this._host.off(this._id); // TODO
            }
        } else if (i===0) {
            this._lstn.shift();
            if (this._lstn.length)
                this.linkup();
            else
                this._host.off(this._id); // TODO
        } else {
            console.warn('listener unknown');
            // no idea, maybe an old uplink or a double-off
        }
    }

}; // proto

//  N E T W O R K I N G

function Stub () {}
var _p = Stub.prototype;
_p.on = _p.off = _p.apply = _p.peer = function(){};


Peer.JsonSeDe = function (host,peerId,pipe) {
    var self = this;
    self.host = host;
    self.pipe = pipe;
    this.id = peerId;
    this.hashes = Peer.hashRing(peerId);
    pipe.on('message',function(msg){
        self.onMessage(msg)
    });
    host.addPeer(this);
};

Peer.JsonSeDe.prototype.send = function (spec,val) {
    var send = {};
    if (typeof(spec)!=='string' && spec._id)
        send = spec;
    else
        send[spec] = val;
    this.pipe.send(JSON.stringify(send)); // TODO open-close-open
};

Peer.JsonSeDe.prototype.off = function (spec,val) {
    this.send(spec._id?spec._id:spec,null);
};

Peer.JsonSeDe.prototype.apply = function (spec,val) {
    if (spec===this.echo)
        return;
    if (val._id)
        this.send(val);
    else
        this.send(spec,val); // TODO   ORDNUNG
};

Peer.JsonSeDe.prototype.on = function (spec,val) {
    this.send (spec._id ? spec._id+spec.vmax() : spec, '');
};

Peer.JsonSeDe.prototype.onMessage = function (mesg) {
    var msg = JSON.parse(mesg);
    console.log(this.id,'>',this.host.id,mesg);
    var _id = msg._id||'';
    for(var sp in msg) {
        if (sp.charAt(0)==='_') continue;
        var value = msg[sp];
        var spec = _id + sp;
        var pattern = Spec.pattern(spec);
        if (/^\/\#\!*$/.test(pattern)) { // on / off
            var oid = Spec.filter(spec,'/#').join('');
            if (value===null) {
                var obj = this.host.objects[oid];
                if (obj)
                    obj.off('',this);
            } else {
                //var myD = Peer.objectPeerDistance(oid,this.host);
                //var hisD = Peer.objectPeerDistance(oid,this.id);
                //if (myD>hisD)  no crime it is
                //    console.warn('downstream open:',Spec.to32(oid),Spec.to32(this.id));
                this.host.on(spec,this);
            }
        } else if (pattern==='/#.!') {  // apply
            var oid = Spec.filter(spec,'/#').join('');
            var obj = this.host.objects[oid];
            if (obj) {
                this.echo = spec;
                obj.apply(spec,value);
                delete this.echo;
            } else
                console.error('apply to a closed object');
        } else {
            console.error('unrecognized pattern',pattern,Spec.to32(spec));
        }
    }
    // TODO always open collection 'peers' to do pex
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

RemotePeer.prototype.apply = function(diff) {
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
