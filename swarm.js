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

/*        Serialize everything as diffs (full diff==state)
diff : {
    collection : {
        objId : {
            key: {ts:tsint,uid:uidint,...,val:value}
        },
        docid : {
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
    var changes = {};
    for(var op in opmap) {
        var x = spec.map(op);
        if (this._versn[x.key] < x.vid){
            changes[x.key] = this._value[x.key]; // TODO sort
            this._value[x.key] = opmap[op];
            this._versn[x.key] = x.vid;
            this._source[x.key] = x.source;
        }
    }
    for(var key in changes)
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


Swarm.prototype.attachReplica = function (oid,obj,json) {
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
Swarm.prototype.uplink = function (oid) {
    // col1 ^ col2 ^ oid1 ^ oid2
    // check hash32 s
};

Swarm.onIncomingMessage = function oIM (msg) {
    obj.apply();
    self.attachReplica();
    this.connectToUplink(pex);
};

Swarm.startWebSocketPeer = function (init_peer_urls, my_url) {
    this.ws = new WebSocketServer();
    this.ws.on('message',function onM(msg) {
        self.onIncomingMessage(msg);
    });
    this.connectToUplink(init_peer_urls);
}

Swarm.connectToUplink = function (uplinkUrl) {
    this.ws = new WebSocket();
    this.ws.on('message',function onM(msg) {
        self.onIncomingMessage(msg);
    });
    this.ws.on('close',function reconnect(){
    });

}


Swarm.addPrototype = function ( name, fn ) {
    this.prototypes[name] = fn;
}

Swarm.setManifest = function ( manifestJson ) {
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

var swarm = new Swarm(), swarm2 = new Swarm();
var SimpleModel = swarm.Model.extend({
    collection: 'simple',
    initial: {
        value: 0,
        collection: {},
        text: new Weave('test')
    },
    onValueChanged : function (newval,oldval) {
        console.log(this.id,' changed value to ',newval);
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

function Swarm ( ) {
    this.vidSource;
    this.lastTs = this.lastSsn = 0;
    this.store = null;
    this.uplink = null;
    this.tables = {};
}

Swarm.int2uni = function (i) {
};
Swarm.uni2int = function(u) {
};

Swarm.prototype.getVid = function () {
    var ts = (new Date()).getTime(), seq=0; // TODO setInterval(function(){},1000);
    if (ts===this.lastTs) {
        seq = ++this.lastSeq;
    } else {
        this.lastTs = ts;
        this.lastSeq = 0;
    }
    return '!'+Swarm.int2uni(ts)+;
        (seq ? '-'+Swarm.int2uni(seq) : '') +
        this.vidSource;
};

Swarm.prototype.open = function (obj,cb) {
    if (!obj._id)
        obj._id = this.getVid();
    this.store.open(obj,function(isStoreOk){
        isStoreOk && cb(isStoreOk);
        this.uplink.open(obj,function(isUplinkOk){ // << obj may have state
            !isStoreOk && cb(isUplinkOk);
        });
    });
};

Swarm.prototype.pickUplink = function (id) {
    this.uplink;
};

Swarm.prototype.apply = function (op) {
    // check _proto pattern
    var table = this.tables[op._proto];
    if (!table)
        return;
    // check _id pattern
    var obj = table[op._id];
    if (!obj)
        return;
    obj.apply(op);
};

function the_apply (change) {
    var vids = this._vid.match(Swarm.vid_re_g);
    var vid = change._vid;
    for(var key in change) {
        if (key.charAt(0)==='_')
            continue;
        var i = this._fields.indexOf(key);
        this[key] = val;
        vids[i] = vid;
    }
    this._vid = vids.join('');
    this._swarm.store.apply(op);
    this._swarm.uplink.apply(op);
    if (this._src) { // downlinks
    }
};

function the_diff (vid) {
    var vids = this._vid.match(Swarm.vid_re_g);
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
    vid = vid || Swarm.getVid();
    var op = {
        _id: this._id,
        _vid: vid,
        _proto: this._proto,
        key: value
    };
    this.apply(op);
};

function the_open (id,cb) {
    this._id = id;
    this._swarm.open(this,cb);
};

Swarm.prototype.extend = function(protof) {
    var sample = new protof();
    protof._fields = []; // compare to {}
    protof._proto = protof.name; //?
    for (var f in sample)
        if (sample.hasOwnProperty(f))
            protof._fields.push(f);
    protof.set = the_set;
    protof.apply = the_apply;
    protof.diff = the_diff;
    protof.open = the_open;

    this.tables[protof.name] = {};
};


function LocalPeer (swarm1) {
}

LocalPeer.prototype.open = function (obj,cb) {
    this.peer.open(copy,function(newobj){
        var diff = newobj.diff(obj._vid);
        obj.apply(diff);
        cb(obj);
        newobj.on('',function(op) {
            this.host.apply(op);
        });
    });

};

function LocalStorage () {
}

LocalStorage.prototype.open = function (obj, cb) {
    var was = this.storage[obj._proto][obj._id];
    if (was)
        for()
            obj[key] = was[key];
    this.storage[obj._proto][obj._id] = obj; // one model?
    cb(was);
};

LocalStorage.prototype.apply = function (op) {
};

