/*
 * IF keyval LOG (may serialize objects instead of JSON)
log: /coll#seq-ssn!ts-seq@uid-ssn+set,key  val
     /coll#doc!ts@uid+in,pos  text

obj: /coll#seq{.value,.versn,.source}.key
set: /coll#seq{.value=coll|undefined,.versn,.source}.seq
txt: /cas
xzo|
ll#doc{.weave,.text,.html}.pid
*/
/*
= Value proposition:
 Good old days: like a local app
* javascript client & server
* distributed generic sync
* automatic persistence
* local calls ~ rpc ~ events ~ data
* comparable to Redis, no serialization
*/

/*   WebStorage key-val formats
store:
    /coll#id.key   value
    /coll#id.key?  !ts@uid
    /coll#id       {key:'value'}
    /coll#id.versn {key:'!ts@uid'}

op:
    /coll#id.key!ts@uid  val
    /coll#set.id!ts@uid  /coll1/coll2
    /coll#doc.pid!ts@uid :pos string
*/

/*  spec key pair breakdown
uid ssn
ts  seq
col id
*/

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
 *    0. loopless synch protocol
 *    1. alphanumeric vid order         OK  (TODO uni)
 *    2. Peer.apply => storage
 *    3. on => diff
 *    4. collection
 *      4.1 diff/apply
 *      4.2 Array compat (SortedSet)
 *    5. address, PEX
 *
 * */

function Peer (id) {
    this.id = id;
    this.lastTs = this.lastSsn = 0;
    this.peers = {};
    this.objects = {};
    this.hashes = Peer.hashRing(this.id);
    //this.localPeer = this;
    this.storage = new Stub();
    this.storage.localPeer = this;
}

if (typeof(module)!=='undefined') {
    module.exports = Peer;
    _ = require('underscore');
}

//  I D  F O R M A T S :  U N I C O D E,  B A S E 3 2,  N U M E R I C
//
//   *peer/objectSet#objectName.fieldCamel!secondSeqno&authorSession
//   each token is 30 bits (6 base32, 4 bytes, 2 unicode chars)
//   oid   /#
//   vid   !& !+& !&- !+&-
//   opid  !#.?!+?&?-?
//   wids  (!+?(&-?)?)* -> (!+&-)*
//   vmax  (&-?!+?)*
//   vmap  (.!&)*
//   paymntDue getPaymentDue() - decorate
//
//   Pro
//      * most of the time it will sit on the RAM idle
//      * we don't plan for CPU-intensive workloads
//      * we minimize the number of objects for gc
//      * we save on strign headers (otherwise >24b per field: pointer plus headers)
//   Contra
//      * we do v8-like binary-field-name optimization
//
//   Collections
//   May have object ids as keys. Cannot have arbitrary keys (wrap as an object then).
//   Collections are mostly 'lists of objects'.
//   Sorting by the value is a common feature; once the value changes send an RPC to the
//   collection(s), e.g. inboxes (could be many).

Peer.int2uni = function (i) {
    return String.fromCharCode( (i>>15)+0x30, (i&0x7fff)+0x30 );
};
Peer.uni2int = function(u) {
    return ((u.charCodeAt(0)-0x30)<<15) + (u.charCodeAt(1)-0x30);
};
Peer.base32 = '234567abcdefghijklmnopqrstuvwxyz';
Peer.int2base = function (i) {
    var ret = [];
    for (var p=0; p<=30; p+=5) 
        ret.push(Peer.base32.charAt((i>>p)&31));
    //while (ret.length<3) ret.push('2');
    return ret.reverse().join('');
};
Peer.base2int = function (b32) {
    var val = 0;
    for(var p=0; p<b32.length; p++) {
        val<<=5;
        val|=Peer.base32.indexOf(b32.charAt(p));
    }
    return val;
};
Peer.str2vmap = function (str) {
    var ret = { toString: Peer.keyval2str }, m=[];
    Peer.re_key_tssrc_g.lastIndex = 0;
    while (m=Peer.re_key_ts_src_g.exec(str))
        ret[m[1]] = m[2];
    return ret;
};
Peer.keyval2str = function () {
    var ret = [];
    for(var key in this)
        if (key.charAt(0)==='.')
            ret.push(key,this[key]);
    return ret.join('');
};
Peer.str2vmax = function (str) {
    var ret = { toString: Peer.vk2str }, m=[];
    Peer.re_src_ts_g.lastIndex = 0;
    while (m=Peer.re_ts_src_g.exec(str)) {
        var ts=m[1], src=m[2];
        if (ts>ret[src])
            ret[src] = ts;
    }
    return ret;
};

// T I M E,  O B J E C T  A N D  V E R S I O N  I D S

var TIME_START = 1262275200; // 1 Jan 2010 (seconds)

Peer.prototype.createVid = function () {
    var ts = (new Date().getTime()/1000)|0, seq=0; //TODO setInterval(function(){},1000);
    ts -= TIME_START;
    if (ts===this.lastTs) {
        seq = ++this.lastSeq;
    } else {
        this.lastTs = ts;
        this.lastSeq = 0;
    }
    return '$'+Peer.int2base(ts) + '-'+Peer.int2base(seq) + this.id;
};

Peer.prototype.createOid = function (proto) {
    if (typeof(proto)==='function')
        proto = proto.name;
    return '/'+proto+'#'+this.createVid();
};

Peer.rs_base32 = '[a-z2-7]{6}';
Peer.rs_vid = '\\$('+Peer.rs_base32+'(?:(\\-'+Peer.rs_base32+'))?)';
Peer.re_vid = new RegExp(Peer.rs_vid,'');
Peer.re_vid_g = new RegExp(Peer.rs_vid,'g');
Peer.rs_collection_id = '\\/(\\w+)';
Peer.re_object_id = new RegExp(
        Peer.rs_collection_id+
        Peer.rs_object_id+
        '(?:'+Peer.rs_vid+')?','');

Peer.createObject = function (oid) {
    var id = obj;
    var m = id.match(Peer.re_object_id);
    if (!m)
        throw 'malformed object id';
    var proto = m[1], vid = m[2], base = m[3];
    var proto_fn = Peer.prototypes[proto];
    if (!proto_fn)
        throw 'prototype unknown: '+proto;
    obj = new proto_fn(id);
    return obj;
};

// P E E R S,  U P L I N K S,  C O N S I S T E N T  H A S H I N G

Peer.hashRing = function (id) {
    return [Peer.hash(id+'one')];
};

Peer.prototype.addPeer = function (peer) {
    var self = this;
    if (peer.constructor===String) // URL
        peer = new RemotePeer(peer); // TODO async?
    var pid = newPeer.id;
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
        if (newDist<oldDist) {
            if (obj._uplink)
                obj._uplink.off(obj);
            peer.on(obj);
        }
    }
};

Peer.prototype.removePeer = function (peer) {
    var pid = peer.id;
    if (!this.peers[pid])
        throw new Error('peer unknown: '+pid);
    delete this.peers[pid];
    for(var oid in this.objects) {
        var obj = this.objects[oid];
        if (obj._uplink===peer) {
            var newUplink = this.findUplink(oid);
            if (newUplink)
                newUplink.open(obj);
            peer.off(obj);
            obj._uplink = newUplink;
        }
        var i = obj._lstn.indexOf(peer);
        if (i!==-1)
            obj.off(peer);
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
    var hashes = peer.hashes;
    var minDist = 0x7fffffff;
    for(var i=0; i<hashes.length; i++)
        if (hashes[i]^hash < minDist)
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

Peer.prototype.on = function (obj,listener) {
    if (obj.constructor===Function)
        obj = this.createOid(obj);
    if (obj.constructor===String) { //  /cid#vid$vid
        if (obj in this.objects)
            obj = this.objects[obj];
        else 
            obj = Peer.createObject(obj);
    }
    if (obj._host && obj._host!==this)
        throw new Error('the object has a host');
    obj._host = this;
    if (!this.objects[obj._id]) {
        this.objects[obj._id] = obj;
        if (obj._uplink)
            throw new Error('the newly added object has an uplink');
        obj._uplink = this.findUplink(obj);
        obj._uplink.on(obj);
    }
    if (listener)
        obj.on('',listener);
    return obj;
};

Peer.prototype.off = function (obj,cb) {
    if (obj.constructor===String)
        obj = this.objects[obj];
    if (cb)
        obj.off('',cb);
    // distributed GC: if peer was a listener on the object => remove
    if (!obj._lstn.length) {
        if (obj._uplink)
            obj._uplink.off(obj);
        delete obj._uplink;
        delete obj._host;
        delete this.objects[obj._id];
    }
};

Peer.prototype.apply = function (op) {
    var obj = this.objects[op._id];
    if (!obj)
        return;
    obj.apply(op);
};

// O B J E C T  P R O T O T Y P E  H A N D L I N G

Peer.prototypes = {};

Peer.extend = function(func) {
    Peer.prototypes[func.name] = func;
    var proto = func.prototype;
    proto._fields = []; // compare to {}
    var sample = new func();
    for (var f in sample)
        if (f.charAt(0)!=='_' && sample.hasOwnProperty(f))
            proto._fields.push(f);
    _.extend(proto,SwarmObjectProto);
};

var SwarmObjectProto = {

    apply: function the_apply (op) {
        var notify = null;
        var opvmap = Peer.str2map(op._ver,Peer.re_key_ver_g);
        var myvmap = Peer.str2map(this._ver,Peer.re_key_ver_g);
        for(var key in opvmap) {
            //if (key.charAt(0)==='_')
            //    continue;
            if (opvmap[key]>myvmap[key]) {
                this[key] = op[key];
                myvmap[key] = opvmap[key];
                notify = notify || {_vid:{}};
                notify[key] = op[key];
            } else
                delete opvmap[key];
        }
        if (notify) {
            notify._ver = opvmap.toString();
            this.trigger(notify);
        }
        this._ver = myvmap.toString();
    },

    trigger: function the_trigger (op) {
        for(var i=0; i<this._lstn.length; i++) {
            var l = this._lstn[i];
            /*if (typeof(l)==='function')
                l(op,this);
            else*/
            l.apply(op,this);
        }
        this._uplink.apply(op,this);
    },

    vmax: function the_vmax () {
        var max = {};
        for(var key in this._vmap) {
            var ver = this._vmap[key];
            Peer.re_vid.lastIndex = 0;
            var m = Peer.re_vid.exec(ver);
            if (m[2]>max[m[1]])
                max[m[1]] = m[2];
        }
        return max;
    },

    diff: function the_diff (vmax) {
        var diff = {
            _id: this._id
        };
        var vmaxmap = Peer.str2map(vmax,Peer.re_src_ver_g);
        var myvmap = Peer.str2map(this._ver,Peer.re_key_ver_g);
        for(var key in myvmap) {
            var src = myvmap[key].match(Peer.re_src_ver)[2];
            if (myvmap[key]>vmaxmap[src])
                diff[key] = this[key];
            else
                delete myvmap[key];
        }
        diff._ver = myvmap.toString();
        return diff;
    },

    set: function the_set (key,value,vid) {
        var op = {
            _id: this._id,
            _vid: vid  || this._uplink.localPeer.createVid(),
            _proto: this.constructor,
            key: value
        };
        this.apply(op);
    },

    on: function the_on (nokey,listener,vmaxBase) {
        if (typeof(listener)==='function')
            listener = {apply:listener};
        this._lstn.push(listener);
        if (vmaxBase!==undefined) {
            var diff = vmaxBase ? this.diff(vmaxBase) : this;
            listener.apply(diff);
        }
    },

    off: function the_off (nokey,listener) {
        var i = this._lstn.indexOf(listener);
        if (i!==-1)
            this._lstn.splice(i,1);
        if (!this._lstn.length && this._host)
            this._host.off(this);
    }

}; // proto

//  N E T W O R K I N G

function Stub () {}
var _p = Stub.prototype;
_p.on = _p.off = _p.apply = _p.peer = function(){};


Peer.JsonSeDe = function (peer,pipeId,pipe) {
    var self = this;
    self.peer = peer;
    self.pipe = pipe;
    this.id = pipeId;
    this.hashes = Peer.hashRing(pipeId);
    //pipe.on('message',function(msg){self.onMessage(msg)});
    peer.addPeer(this);
};
Peer.JsonSeDe.prototype.off = function (obj) {
    var send = {};
    send[obj._id] = ''; // off
    this.pipe.send(JSON.stringify(send));
};
Peer.JsonSeDe.prototype.apply = function (op) {
    var src = op._src;
    if (src===this)
        return; // no cycles
    delete op._src;
    var send = {};
    send[op._id] = op;
    this.pipe.send(JSON.stringify(send));
    op._src = src;
};
Peer.JsonSeDe.prototype.on = function (obj) {
    var send = {}; // TODO batching NOTE: only applies can be merged
    send[obj._id] = obj._vid._max;
    this.pipe.send( JSON.stringify(send) );
}
Peer.JsonSeDe.prototype.peer = function (peer) {
    this.pipe.send(JSON.stringify({peer:peer.address}));
};
Peer.JsonSeDe.prototype.onMessage = function (mesg) {
    var msg = JSON.parse(mesg);
    console.log('\t>',mesg);
    for(var oid in msg) {
        var op = msg[oid];
        op._src = this;
        if (oid in this.peer.objects) {
            this.peer.objects[oid].apply(op);
        } else {
            var myD = Peer.objectPeerDistance(oid,this.peer.id);
            var hisD = Peer.objectPeerDistance(oid,this.id);
            if (myD<hisD)
                this.peer.on(op);
            else
                console.error('downstream open:',oid,this.id);
        }
    }
    // TODO always open collection 'peers' to do pex
};

function pex (op,peerColl) {
    var peer = peerColl._uplink.localPeer;

}

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
