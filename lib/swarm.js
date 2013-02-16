/*   IF keyval LOG (may serialize objects instead of JSON)
log: /coll#seq-ssn!ts-seq@uid-ssn+set,key  val
     /coll#doc!ts@uid+in,pos  text

obj: /coll#seq{.value,.versn,.source}.key
set: /coll#seq{.value=coll|undefined,.versn,.source}.seq
txt: /cas
xzo|
ll#doc{.weave,.text,.html}.pid
*/

/*  attempt to piggyback v8 hashmaps
registry : {
    collection : {
        objId : {
            ts : {
                key:  tsint
            },
            seq : {
                key:  seqint
            },
            uid : {
                key:  uidint
            },
            ssn : {
                key:  ssnint
            },
            val : {
                key:  value
            }
        }
    }
}  */

/*
= Value proposition:
 Good old days: like a local app
* javascript client & server
* distributed generic sync
* automatic persistence
* local calls ~ rpc ~ events ~ data
* comparable to Redis, no serialization
*/

/*        JsonSeDeialize everything as diffs (full diff==state)
diff : {
    collection : {
        objId : {
            key: {ts:tsint,uid:uidint,...,val:value}
        },
        objId : {
            pid : {
                pos: {ts:tsint,uid:uidint,...,val:value}
            }
        },
        colid : {
            cid : {
                id : {ts:tsint,uid:uidint,...}
            }
        }
    }
}
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
 
/*  diff/set/apply sketch
function Model () {
}

Model.prototype.diff = function (vidMap) {
    var opmap = {};
    for(var key in this._versn) {
        var vals = spec.map(this._versn[key]);
        var ackd = vidMap[vals.source];
        if (ackd < vals.version)
            //ret.push(this.scope+vals.version+vals.source+'+set,'+key,'\t',this._value[key]);
            opmap[vals.vid+'+set,'+key] = this._value[key];
    }
    return opmap;
}

Model.prototype.apply = function (opmap) {
    var ops = {};
    for(var op in opmap) {
        var x = spec.map(op);
        if (this._versn[x.key] < x.vid){
            ops[x.key] = this._value[x.key]; // TODO sort
            this._value[x.key] = opmap[op];
            this._versn[x.key] = x.vid;
            this._source[x.key] = x.source;
        }
    }
    for(var key in ops)
        this.trigger(key);
}

Model.prototype.set = function (key,val) {
    var vid = this.createVid();
    var opmap = {
        vid+'+set,'+key:  val
    });
    this.apply(opmap);
    this.store.save(opmap);
    this.swarm.relay(opmap);
}

Model.prototype.close = function () {
    swarm.close(this);
    // also: unregister listeners
}


Peer.prototype.attachReplica = function (oid,obj,json) {
    if (json && !obj) {
        var cid;
        var proto = this.manifest[cid].proto;

        new Model (skeleton);
        // install methods

        obj = new ( proto&&this.prototypes[proto] ? this.prototypes[proto]: Model ) ();
        obj._value = json.value;
        obj._versn = json.versn;
        //obj._access = json.access;
    }
    this.objects[oid] = obj;
    if (oid in this.callbacks) {
        var cbarr = this.callbacks[oid];
        delete this.callbacks[oid];
        for (var cb=cbarr.pop(); cb.length; cb=cbarr.pop())
            cb(null,obj);
    }
    if (oid in this.downlinkOpens) {
        var cbarr = this.callbacks[oid];
        delete this.callbacks[oid];
        for (var cb=cbarr.pop(); cb.length; cb=cbarr.pop()) {
            if (!mark)
                dl.send(json);
            else
                dl.send(obj.diff(mark));
        }
    }
    this.storage.save(json);
    return obj;
}; */

/*  WebSocket sketch
Peer.prototype.uplink = function (oid) {
    // col1 ^ col2 ^ oid1 ^ oid2
    // check hash32 s
};

Peer.onIncomingMessage = function oIM (msg) {
    obj.apply();
    self.attachReplica();
    this.connectToUplink(pex);
};

Peer.startWebSocketPeer = function (init_peer_urls, my_url) {
    this.ws = new WebSocketJsonSeDever();
    this.ws.on('message',function onM(msg) {
        self.onIncomingMessage(msg);
    });
    this.connectToUplink(init_peer_urls);
}

Peer.connectToUplink = function (uplinkUrl) {
    this.ws = new WebSocket();
    this.ws.on('message',function onM(msg) {
        self.onIncomingMessage(msg);
    });
    this.ws.on('close',function reconnect(){
    });

}


Peer.addPrototype = function ( name, fn ) {
    this.prototypes[name] = fn;
}

Peer.setManifest = function ( manifestJson ) {
    if (manifestJson.constructor===String)
        manifestJson = JSON.parse(manifestJson);
    this.manifest = manifestJson;
}


function LocalSocket (swarm) {
    this.farEnd = swarm;
    swarm.addPeer({
        open : function (oid,cb) {
            self.emit('open',???);
        },
        append : function (op) {
            self.emit('append',op);
        }
    });
}
LocalSocket.prototype.open = function (oid,cb){
    this.farEnd.open(oid,cb);
}
LocalSocket.prototype.append = function (op) {
    this.farEnd.append(op);
}
*/

/*
swarm.init = function (manifest) {
    for(var cid in manifest) {
        var coll =  manifest[cid];
        swarm.prototypes[cid] = function () {
            for(var key in coll.initial)
                this[key] = coll.initial[key];
        }
        var methods = _.functions(coll);
        _.extend( swarm.prototypes[cid], _.pick(coll,methods) );
        proto.set = the_set;
        for(var key in coll.initial) {
            proto['set'+camel] = function (val) {this.set(key,val)}
            proto['get'+camel] = function () {return this.get(key)}
        }
    }
};

swarm.open = function (cid,oid,cb) {
    var coll = swarm.registry[cid];
    if (!coll) throw 'collection unknown';
    if (oid in coll)
        return cb(coll[oid]);
    if (cb) {
        if ( ! (oid in swarm.opencb) )
            swarm.opencb[oid] = [];
        swarm.opencb[oid].push(cb);
    }
    // check storage
    swarm.store.open(cid,oid,function(sobj){
        if (sobj)
            attach(cid,oid,sobj);
        swarm.uplink.open(cid,oid,vid,function(uobj) {
            attach(cid,oid,uobj);
        });
    });
    // ask uplink
    // register obj
    // do callback
};

swarm.attach = function (cid,oid,obj) {
    var model = new swarm.prototypes[cid](obj);
    swarm.registry[cid][oid] = model;
    if (cid+oid in swarm.opencb) {
        var cbs = swarm.opencb[cid+oid], cb;
        delete swarm.opencb[cid+oid];
        while(cb=cbs.pop())
            cb(model);
    }
};

swarm.append = function (op) {
    var obj;
    if (obj['.'+key]>=op.vid)
        return;
    obj[key] = op.val;
    obj['.'+key] = op.vid;
    if ('on'+camel+'Change' in obj)
        obj.onCamelChange(op.val,oldval);
    obj.emit(op.key,newval);
};


// test seq
//
//

function Weave(){}

var swarm = new Peer(), swarm2 = new Peer();
var SimpleModel = swarm.Model.extend({
    collection: 'simple',
    initial: {
        value: 0,
        collection: {},
        text: new Weave('test')
    },
    onValueChanged : function (newval,oldval) {
        console.log(this.id,' opd value to ',newval);
        setTimeout(waitAndInc,1000);
    }
});

swarm1.addPeer( new LocalSocket(swarm) );

var sampleCounter = new SimpleModel('/cnt-i1', waitAndInc);

function waitAndInc () {
    sampleCounter.setValue( sampleCounter.getValue() + 1 );
}

//swarm.close();
*/

// DIFF_VAL AUTH_TYPE_ID  AN_INSERT
/*
function LiveModel (id,values) {
    for(var att in this.defaults) {
        this[att] = values[att] || this.defaults[att];
        this['_ts_'+att] = id.ts;
        this['_src_'+att] = id.src;
    }
    this._ts = id.ts;
    this._src = id.src;
    this._year = 0;
}

LiveModel.source = 0;

LiveModel.id = function () {
    return {
        ts: new Date().getTime()<<3,  // 32/sec
        src: LiveModel.source
    };
}

LiveModel.prototypes.diff = function (since_id) {
    //var ts = this._ts, src = this._src;
    var diff = new LiveModel(this.model); // ???
    for(var att in model) {
        var tsn = '_ts_'+att, srcn = '_src_'+src;
        var att_ts = this[tsn], att_src = this[srcn];
        if (att_ts>since_id.ts || (att_ts===since_id.ts && att_src>since_id.src)) {
            diff[att] = this[att];
            diff[tsn] = att_ts;
            diff[srcn] = att_src;
        }
    }
}

LiveModel.prototypes.apply = function (diff) {
    for(var att in model) {
        var tsn = '_ts_'+att, srcn = '_src_'+src;
        var att_ts = this[tsn], att_src = this[srcn];
        if (att_ts>since_id.ts || (att_ts===since_id.ts && att_src>since_id.src)) {
            diff[att] = this[att];
            diff[tsn] = att_ts;
            diff[srcn] = att_src;
        }
    }
    // trigger events
}
*/

function Peer (id) {
    this.id = id;
    this.vidSource;
    this.lastTs = this.lastSsn = 0;
    this.peers = {};
    this.objects = {};
    this.hashes = Peer.hashRing(this.id);
    this.localPeer = this;
}

if (typeof(module)!=='undefined')
    module.exports = Peer;

Peer.int2uni = function (i) {
    return String.fromCharCode( (i>>15)+0x30, (i&0x7fff)+0x30 );
};
Peer.uni2int = function(u) {
    return ((u.charCodeAt(0)-0x30)<<15) + (u.charCodeAt(1)-0x30);
};
Peer.base32 = '234567abcdefghijklmnopqrstuvwxyz';
Peer.int2base = function (i) {
    var ret = [];
    for (; i; i>>=5)
        ret.push(Peer.base32.charAt(i&31));
    while (ret.length<3) ret.push('2');
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

Peer.hashRing = function (id) {
    return [Peer.hash(id+'one')];
};

Peer.prototype.addPeer = function (peer) {
    var self = this;
    if (peer.constructor===String)
        peer = new RemotePeer(peer);
    if (peer.localPeer)
        throw 'the peer stub was already added to this Peer';
    peer.localPeer = this;
    if (!peer.hashes)
        peer.hashes = Peer.hashRing(peer.id);
    self.onPeerConnected(peer);
};

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
    return '$'+Peer.int2base(ts)+'-'+Peer.int2base(seq);
    //return '!'+Peer.int2uni(ts)+
    //    (seq ? '-'+Peer.int2uni(seq) : '') +
    //    this.vidSource;
};

Peer.prototype.createOid = function (proto) {
    if (typeof(proto)==='function')
        proto = proto.name;
    return '/'+proto+'#'+this.createVid();
};

Peer.rs_base32 = '[a-z2-7]{3,6}';
Peer.rs_vid = '\\$('+Peer.rs_base32+'(?:(\\-'+Peer.rs_base32+'))?)';
Peer.re_vid = new RegExp(Peer.rs_vid,'');
Peer.re_vid_g = new RegExp(Peer.rs_vid,'g');
Peer.rs_collection_id = '\\/(\\w+)';
Peer.re_object_id = new RegExp(
        Peer.rs_collection_id+
        Peer.rs_object_id+
        '(?:'+Peer.rs_vid+')?','');

Peer.prototype.on = function (obj,listener) {
    var id;
    if (obj.constructor===String) { //  /cid#vid$vid
        id = obj;
        if (id in this.objects) {
            this.objects[id]._lstn.push(listener); // FIIIIXME FIXME
            return this.objects[id];
        }
        var m = id.match(Peer.re_object_id);
        if (!m)
            throw 'malformed object id';
        var proto = m[1], vid = m[2], base = m[3];
        var proto_fn = Peer.prototypes[proto];
        if (!proto_fn)
            throw 'prototype unknown: '+proto;
        obj = new proto_fn(id);
    }
    id = obj._id || this.createOid(obj.constructor);
    if (this.objects[id])
        return this.objects[id];
    obj._id = id; // make sure
    this.objects[id] = obj;
    if (!obj._uplink) {
        obj._uplink = this.findUplink(obj);
        obj._uplink.on(obj);
    }
    if (!obj._lstn)
        obj._lstn = [];
    if (listener)
        obj._lstn.push(listener);
	return obj;
};

Peer.prototype.off = function (objid,cb) {
    var obj = this.objects[objid];
    obj && obj.off('',cb);
};

Peer.prototype.apply = function (op) {
    var obj = this.objects[op._id];
    if (!obj)
        return;
    obj.apply(op);
};

// P R O T O T Y P E  H A N D L I N G

Peer.prototypes = {};

Peer.extend = function(func) {
    var sample = new func();
    var proto = func.prototype;
    proto._fields = []; // compare to {}
    //proto._proto = protof.name; //?
    for (var f in sample)
        if (f.charAt(0)!=='_' && sample.hasOwnProperty(f))
            proto._fields.push(f);
    proto.set = the_set;
    proto.apply = the_apply;
    proto.diff = the_diff;
    proto.trigger = the_trigger;
    proto.on = the_on;
    proto.off = the_off;
    Peer.prototypes[func.name] = func;
    var vid = [];
    for(var i=0; i<proto._fields.length; i++)
        vid.push('$222-222');
    proto._vid = vid.join('');
};

// O B J E C T  P R O T O T Y P E  F U N C T I O N S

function the_apply (op) {
    var vids = (this._vid||'').match(Peer.re_vid_g);
    var vid = op._vid;
    var notify = false;
    for(var key in op) {
        if (key.charAt(0)==='_')
            continue;
        var i = this._fields.indexOf(key);
        if (vids[i]>=vid) {
            delete op[key]; // FIXME
            continue;
        }
        this[key] = op[key];
        vids[i] = vid;
        notify = true;
    }
    this._vid = vids.join('');
    if (notify)
        this.trigger(op);
};

function the_trigger (op) {
    for(var i=0; i<this._lstn.length; i++) {
        var l = this._lstn[i];
        if (typeof(l)==='function')
            l(op);
        else
            l.apply(op);
    }
    this._uplink.apply(op);
};

function the_diff (vid) {
    var vids = this._vid.match(Peer.vid_re_g);
    var diff = {
        _id: this._id,
        _vid: vids,
        _proto: this._proto,
    };
    for(var f in this._fields)
        if (this._fields[f]>vid) 
            diff[f] = this[f];
        else
            vids[i] = '!00';
    diff._vid = vids.join('');
    return diff;
};

function the_set (key,value,vid) {
    var op = {
        _id: this._id,
        _vid: vid  || this._uplink.localPeer.createVid(),
        _proto: this.constructor,
        key: value
    };
    this.apply(op);
};

function the_on (nokey,listener,knownVid) {
	if (typeof(listener)==='function')
		listener = {apply:listener};
    this._lstn.push(listener);
	if (knownVid!==undefined) {
		var diff = knownVid ? this.diff(knownVid) : this;
		listener.apply(diff);
	}
};

function the_off (nokey,listener) {
    var i = this._lstn.indexOf(listener);
    if (i!==-1)
        this._lstn.splice(i,1);
    if (!this._lstn.length) {
        if (this._uplink)
            this._uplink.off(this.apply);
        Peer.close(this);
    }
};

function Stub () {}
var _p = Stub.prototype;
_p.on = _p.off = _p.apply = _p.peer = function(){};



Peer.hash = function (str) {
    if (str.length<4)
        str = str+str;
    var res = 0, len = str.length;
    for (var i = 0; i < len; i++)
        res = res * 31 + str.charCodeAt(i);
    return res&0x7fffffff;
}

Peer.objectPeerDistance = function (object, peer) {
    peer = peer || object._uplink;
    var hash;
    if (object.constructor===String) {
        hash = Peer.hash(object);
    } else if (object.constructor.name in Peer.prototypes) {
        hash = object._hash;
        if (!hash) {
            if (!object._id) throw 'object has no id';
            hash = object._hash = Peer.hash(object._id);
        }
    } else { 
        console.error(object);
        console.error(object.constructor.name);
        console.error(Peer.prototypes);
        throw new Error('need an object or an id');
    }
    var hashes = peer.hashes;
    var minDist = 0x7fffffff;
    for(var i=0; i<hashes.length; i++)
        if (hashes[i]^hash < minDist)
            minDist = hashes[i]^hash;
    return minDist;
};

Peer.prototype.findUplink = function (obj) {
    var minDist = Peer.objectPeerDistance(obj,this),
        minPeer = this;
    for(var pid in this.peers) {
        var dist = Peer.objectPeerDistance(obj,this.peers[pid]);
        if (minDist>dist) {
            minDist = dist;
            minPeer = this.peers[pid];
        }
    }
    return minPeer;
};

Peer.prototype.onPeerConnected = function (newPeer) {
    var self = this;
    var pid = newPeer.id;
    for(var p in self.peers)
        this.peers[p].peer(newPeer);
    self.peers[pid] = newPeer;
    for(var oid in self.objects) {
        var obj = self.objects[oid];
        var oldDist = Peer.objectPeerDistance(obj);
        var newDist = Peer.objectPeerDistance(obj,newPeer);
        if (newDist<oldDist) {
            if (obj._uplink)
                obj._uplink.off(obj);
            newPeer.on(obj);
        }
    }
};

Peer.prototype.onPeerDisconnected = function (ws) {
    var peer = ws.peer;
    var peerId = peer.id;
    var hashes = this.hashRingPoints(peerId);
    for(var objId in this.objects) {
        var obj = this.objects[objId];
        if (obj._uplink===peer) {
            var newResp = this.findResponsiblePeer(objId);
            if (newResp)
                newResp.open(obj);
        }
        var i = obj._lstn.indexOf(peer);
        if (i!==-1)
            obj.removeListener(peer);
        // distributed GC: if peer was a listener on the object => remove
    }
    delete this.peers[peerId];
};

Peer.onPeerMessage = function (message) {
    var peer;
    if ('open' in message) {
        for(var objId in message.open) {
            var obj = this.get(objId) || this.on(objId);
            obj.addListener(peer);
            peer.ackd[objId] = message.open[objId]; // diff will be filtered
        }
    } else if ('diff' in message) {
        for(var objId in message.diff) {
            var obj = this.get(objId);
            if (obj)
                obj.apply(message.diff[objId]);
            else
                peer.close(objId);
        }
    } else if ('pex' in message) {
        for(var peerId in message.pex) 
            if (!this.hasPeer(peerId))
                this.connectPeer(peerId,message.pex[peerId]);
    }
};


Peer.JsonSeDe = function (peer,pipeId,pipe) {
    var self = this;
    self.peer = peer;
    self.pipe = pipe;
    this.id = pipeId;
    this.hashes = Peer.hashRing(pipeId);
    //pipe.on('message',function(msg){self.onMessage(msg)});
    peer.addPeer(this);
};
Peer.JsonSeDe.prototype.on = function (obj) {
    this.pipe.send(JSON.stringify({on:obj._id})); // TODO obj._id+obj._vid
};
Peer.JsonSeDe.prototype.off = function (obj) {
    this.pipe.send(JSON.stringify({off:obj._id}));
};
Peer.JsonSeDe.prototype.apply = function (op) {
    this.pipe.send(JSON.stringify({apply:op}));
};
Peer.JsonSeDe.prototype.peer = function (peer) {
    this.pipe.send(JSON.stringify({peer:peer.address}));
};
Peer.JsonSeDe.prototype.onMessage = function (mesg) {
    var msg = JSON.parse(mesg);
    console.log('\t>',mesg);
    for(var key in msg)
        switch (key) {
            case 'on':    this.peer.on(msg.on,this); break; // FIXME double count
            case 'off':   this.peer.off(msg.off,this); break;
            case 'apply': this.peer.apply(msg.apply); break;
            case 'peer':  this.peer.peer(msg.peer); break;
            default: throw 'malformed key: '+key;
        }
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
