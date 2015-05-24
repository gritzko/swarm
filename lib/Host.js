"use strict";

var env = require('./env');
var Spec = require('./Spec');
var Op = require('./Op');
var Syncable = require('./Syncable');
var Storage = require('./Storage');
//var Pipe = require('./Pipe');
var SecondPreciseClock = require('./SecondPreciseClock');

/** Swarm has three orthogonal parts: Logics, Host and Storage.
 * Storage is a key-value db for operation logs (op logs).
 * Logics is a world of syncable CRDT syncables that consume ops.
 * Host deals with object subscriptions and op forwarding.
 *
 * Practically, a Host is a client (browser/mobile) or a server process.
 * Differently from other classes of systems, Swarm deals with
 * per-object subscriptions so a developer may use an arbitrary
 * collection of "live" replicated syncables (syncables) on the
 * client side. The resulting (asynchronous!) message exchange
 * patterns are quite complicated: per-object subscriptions,
 * operation forwarding, secondary clients, relinking to maintain
 * a consistent hashing ring etc.
 * Host focuses exactly on that part of the problem, so the Storage
 * may stay key-value dumb and Logics may be mathematically pure.
 * Host maintains local clocks and, generally, glues it all together.
 */
function Host(id, ms, storage) {
    this.syncables = {};
    this.storage = storage || new Storage();
    this.id = id;
    this.sources = {};
    if (storage) {
        storage.id = this.id + '~' + storage.ssnSuffix;
    }
    this._server = /^swarm~.*/.test(id);
    var clock_fn = env.clockType || SecondPreciseClock;
    this.clock = new clock_fn(this.id, ms||0);

    // Once a handshake is completed (.bundle, .reon) a peer host starts
    // listening to object's new ops (we add it to this.links[id]).
    // On .off received or connection breakage we remove the entry.
    this.links = {}; // { id : [src1, src2...] }

    // Once we start tracking an object we join its spanning tree.
    // Triggered by an incoming .on or local new Syncable(), link()
    // calculates the uplink for the object, sends out .on and puts
    // pipe id in this.unlinks.
    // Later on handshake completion, the same pipe id gets listed
    // in this.links.
    // The entry is overwritten on uplink departure/arrival, removed
    // by uplink() (triggered by an incoming .off or local gc()).
    this.uplink = {}; // { id: src_id }

    // Incoming .on/.reon operations are forwarded (to Storage, uplink,
    // downlink) to receive a response (a .bundle, maybe an empty one).
    // Such pending ops are remembered to forward the response back.
    // A bundle clears pending state, creates linked state (this.links)
    this.pending = {}; // { /T#id!ver : {value, source_id} }

    this.wait_state = {};

    // FIXME
    this.forward; // transparent forward/fanout
    this.servers  = {};

    if (this.storage) {
        //this.sources[this.id] = this.storage;
        this.storage.host = this;
    }

    if (!env.multihost) {
        if (env.localhost) {
            throw new Error('use multihost mode');
        }
        env.localhost = this;
    }
}

module.exports = Host;

Host.MAX_INT = 9007199254740992;
Host.MAX_SYNC_TIME = 60 * 60000; // 1 hour (milliseconds)
Host.HASH_POINTS = 3;

Host.hashDistance = function hashDistance(pipe, obj) {
    if ((obj).constructor !== Number) {
        if (obj._id) {
            obj = obj._id;
        }
        obj = env.hashfn(obj);
    }
    if (pipe.id) {
        pipe = pipe.id;
    }
    var dist = 4294967295;
    for (var i = 0; i < Host.HASH_POINTS; i++) {
        var hash = env.hashfn(pipe.id + ':' + i);
        dist = Math.min(dist, hash ^ obj);
    }
    return dist;
};

/** 0.4 refac
*
*   (1) state to be sufficient for a merge (IdArray generaliz TODO)
*   (2) log to stay in Storage for syncing
*   (3) forward tail queries to Storage (.on semantics)
*   (4) log horizon/compaction/wtw @Storage
*   (5) correct diff @Storage
*/

/** The primary op routing function */
Host.prototype.deliver = function (op, pipe) {

    if (op.constructor!==Op) {
        throw new Error('ops only');
    }
    //var op = new Op(spec, value, source&&source.id);

    console.log((op.source||'local')+'>'+this.id, op.toString());


    // HANDSHAKE vs PIPE vs OBJECT vs STORAGE
    // Pipe: to uplink(relay) or to storage
    // Storage: fanout (some go to uplink)
    // Object: to storage.
    if (op.source===this.id) { // locally originated
        this.dispatchLocalOp(op);
    } else if (op.spec.type() === 'Host') { // handshake from a (remote) Host
        this.dispatchHostHandshake(op, pipe);
    } else if (op.source===this.storage.id) { // own storage
        this.dispatchStorageOp(op);
    } else { // remote host
        if (op.source in this.sources) {
            this.dispatchRemoteOp(op);
        } else {
            console.error("source unknown:", op.source, op);
            throw new Error("unknown source: "+op.source);
        }
    }
};

Host.prototype.dispatchLocalOp = function (op) {
    switch (op.name) {
        case 'on':
            this.pending[op.stamp] = op;
            this.storage.deliver (op);
        break;
        case 'reon':
        throw new Error('impossible'); // logix is the terminal downlink
        case 'off':
            // TODO gc
        case 'reoff':
        throw new Error('impossible');
        case 'error':
            console.error(op.toString());
        break;
        default:
            this.storage.deliver(op);
        break;
    }
};


Host.prototype.dispatchRemoteOp = function (op) {
    if (!op.source) {
        throw new Error('handshake first');
    }
    // TODO:  SEPARATE CODE FOR RELAY BEHAVIOR
    // consistent hashing ring
    // don't send it to our storage
    // forward, send response back: handshakes to the source,
    // ops by the tree

    // finally, neatly consolidated on/reon/off/reon code
    switch (op.name) {
        case 'on': // let's see what the storage says first
            this.pending[op.stamp] = op;
            this.storage.deliver (op);
        break;
        case 'reon': // request a .bundle from the storage
            var orig = this.wait_state[op.stamp];
            if (orig) { // the uplink has no state too
                delete this.wait_state[op.stamp];
                while (orig.length) { // respond with .reons
                    var o = orig.shift();
                    var reon = new Op(o.spec.set('.reon'), '', this);
                    this.send(o.source, reon);
                }
            } else { // OK, let the storage make a bundle
                this.storage.deliver(op);
            }
        break;
        case 'off': // remove from subscribers; gc and uplink.off if none left
            var links = this.links[op.id];
            if (links) {
                var i = links.indexOf(op.source);
                i!==-1 && links.splice(i,1);
                var reoff = new Op(op.spec.set('.reoff'), '', this);
                this.send(op.source, reoff);
            }
        break;
        case 'reoff': // the uplink does not listen anymore
            var up = this.uplink[op.id];
            if (op.source!==up) { return; }
            delete this.uplink[op.id];
            links = this.links[op.id], i;
            if ( links && -1!==(i=links.indexOf(op.source)) )  {
                links.splice(i, 1);
            }
            // TODO this.gc(spec);
        break;
        case 'bundle':
            this.storage.deliver(op);
            var waits = this.state_wait[op.id];
            if (waits)  { // the uplink gives us the state
                delete this.wait_state[op.id];
                while (waits.length) { // replay those incoming .ons
                    this.storage.deliver(waits.shift());
                }
            }
        break;
        case 'state':
            if (op.version===op.id) {// state push (no subscription)
                this.storage.deliver(op);
            } else {
                this.send(op.source, op.error('orphan state',this));
            }
        break;
        default:// a regular operation that will somehow modify the state
            this.storage.deliver(op);
        break;
    }
};

Host.prototype.dispatchStorageOp = function (op) {

    switch (op.name) {

        case 'on': // a hinted .on from the storage
            var uplink = this.getUplink(op.spec);
            uplink && this.send(uplink, op);
            // on->preon->on, use the stamp of the original
            // incoming subscription that is already pending
        break;
        case 'reon':
            var pending = this.pending[op.stamp];
            if (!pending) {return;}
            delete this.pending[op.stamp];
            if (op.value==='') { // we have no state
                uplink = this.getUplink(op.id);
                if (uplink) { // maybe, the uplink has some state?
                    var wait = this.wait_state[op.stamp];
                    if (!wait) {wait = this.wait_state[op.stamp] = [];}
                    wait.push(pending);
                    var fwd_on = new Op(pending.spec, '', this);
                    this.send(uplink, fwd_on);
                } else { // OK, we have nothing
                    if (pending.source!==this.id) { // TODO Syncable.reon
                        this.send(pending.source, op);
                    }
                }
            } else { // subscribe back to the original source
                if (pending.source!==this.id) {
                    this.send(pending.source, op);
                }
                // hint the storage to make an uplink subscription
                var hinted_on = new Op(pending.spec.set('.preon'), '', this);
                this.storage.deliver(hinted_on);
            }
        break;
        case 'bundle': // the client should read ops now => put on the list
            pending = this.pending[op.stamp];
            if (!pending) { return; } // some bug
            // after the peer's replica state is made
            // equal to our state, all the new ops must be
            // relayed there to keep it up to date
            links = this.links[op.id];
            if (!links) { links = this.links[op.id] = []; }
            links.push(pending.source); // TODO repeats
            // by convention, source==='' means a local object
            this.send(pending.source, op);
            // the initial incoming .on stays in this.pending[]
        break;
        default: // the storage says it is a new op => relay it
            var links = this.links[op.id] || [];
            for(var i=0; i<links.length; i++) {
                this.send(links[i], op);
            }
        break;
    }
};





/** Incoming subscription, essentially a read request for an object.
  * Read for them is write for us (READ=WRITE^-1).
  * Normally, an `.on` is received from  a downlink (client), sometimes
  * from a shortcut (peer) connection. `.on` is reciprocated with
  * `.reon` in case the source has write rights (i.e. may author ops). */


/**  {.reon: !version} {.reon: ''} {.reon: !0} {.reon: !~~~~~} */







/*Host.prototype.onReciprocalSubscription = function (spec, value, source) {
    // 1. query the storage

    var id = spec.id();


    var o = this.get(spec);
    if (value) {
        var rediff = o.diff(new Spec(value).filter('!'));
        if (rediff) {
            source.deliver(spec.set('.bundle'), rediff, this);
        }
    } else {
        var state = o.toPojo(true);
        source.deliver(spec.set('.state'), state, this);
    }
    // forward reon to downlinks
    var version = o.version().toString();
    var up_id = this.getUplink(id);
    if ((source.id===up_id) || (up_id===null&&source===this.storage)) {
        if (!(id in this.uplink)) { // me joined the tree
            var dls = this.downlinks[id];
            for(var d=0; dls && d<dls.length; d++) {
                var src = this.sources[dls[d]];
                src && src.deliver(spec,version,this);
            }
        }
        var existing = this.uplink[id];
        if (existing && existing!==source.id) {
            var ex_src = this.getSource(existing);
            ex_src && ex_src.deliver(spec.set('.off'), '', this);
        }
        this.uplink[id] = source.id;
    }
};*/


/** Bundles are groups of operations related to the same object. Those are
 * sent to achieve pseudo-atomicity (when sending a log tail) or as a
 * performance optimization.
Host.prototype.onBundle = function (spec, value, source) {
    var has_state = false;
    for(var vo in value) {
        has_state |= vo.indexOf('.state')!==-1;
    }
    if (!has_state) { // just a bundle
        this.onOp(spec,value,source);
    } else { // state and log tail
        this.onState(spec,value,source);
    }
};*/

/** A state bootstraps a local object replica. State+log is classics.
  * http://en.wikipedia.org/wiki/State_machine_replication */
Host.prototype.onPipeState = function (spec, value, source) {
    var id = spec.id();
    var o = this.get(spec);
    // TODO proxy Host to use reon !v to route diffs/states
    if (source!==null) {
        if (!o._version) {
            o.deliver(spec,value,source);
        } else { // TODO think hard
            if (source.id === this.uplink[id]) {
                console.warn("accept: state for a stateful object", spec);
                o.deliver(spec,value,source);
            } else {
                console.error("reject: state for a stateful object", spec);
            }
        }
    }
    // note that state is relayed differently than a regular op: downlinks only
    var ons = this.pending_downlinks[id];
    if (ons) { // unfreeze subscriptions
        var self = this;
        ons.forEach( function(pon) {
            var src = self.sources[pon.source];
            src && self.deliver(new Spec(pon.spec), pon.value, src);
        } );
        delete this.pending_downlinks[id];
    }
};


/** new Type()  in multihost env it may be safer to use Host.get() or,
  * at least, new Type(id, host) / new Type(somevalue, host) */
Host.prototype.get = function (spec, callback) {
    if (spec && spec.constructor === Function && spec.prototype._type) {
        spec = '/' + spec.prototype._type;
    }
    spec = new Spec(spec);
    var typeid = spec.filter('/#');
    if (!typeid.has('/')) {
        throw new Error('typeless spec');
    }
    var o = typeid.has('#') && this.syncables[typeid];
    if (!o) {
        var t = Syncable.types[spec.type()];
        if (!t) {
            throw new Error('type unknown: ' + spec);
        }
        o = new t(typeid, this);
    }
    return o;
};


Host.prototype.send = function send (src_id, op) {
    if (src_id===this.id) {
        var obj = this.syncables[op.id];
        obj.deliver(op);
    } else {
        var src = this.sources[src_id];
        src && src.deliver(op);
    }
};


/**
 *
 * Uplink connections may be closed or reestablished so we need
 * to adjust every object's subscriptions time to time.
 */
Host.prototype.linkUp = function (spec, version) {
    var o = this.get(spec), id = o._id;
    var needed = this.getUplink(id); // may return null
    var existing = this.uplink[id];
    var pending = this.pending_uplink[id];
    if (existing===needed) { // seems OK
        if (pending && pending!==needed) { // cancel that one
            var off = o.spec().add(this.time(),'!').add('.off');
            this.send(pending, new Op(off, '', this));
            delete this.pending_uplink[id];
        }
    } else if (pending===needed) {
        "seems OK";
    } else {
        if (pending) {
            this.send(pending, o.spec().add(this.time(),'!').add('.off'));
        }
        needed && this.send(
            needed,
            o.spec().add(spec.version()||this.time(),'!').add('.on'),
            o.version().toString()
        );
    }
};

Host.prototype.unlink = function (spec) {

};

Host.prototype.relinkAll = function () {
    // TODO .4 no own storage => .off everyone to re-handshake
};

Host.prototype.gc = function (spec) {
    /*if (links.length===0 && !(id in this.syncables)) { // gc() ?
        delete this.links[id];
        var uplink = this.uplink[id];
        this.send(uplink,spec.set('.off'));
        delete this.uplink[id];
    }*/
};

Host.prototype.registerSyncable = function (spec, obj) {
    var ev_spec = obj.spec().add(spec.version()||this.time(),'!');
    var id = spec.id();
    if (id in this.syncables) {
        return this.syncables[id];
    }
    this.syncables[id] = obj;
    var uplink = this.getUplink(id);
    // for newly created objects, the state is pushed ahead of the
    // handshake as the uplink has nothing, we know that already
    if (uplink && obj._id===obj._version.substr(1)) {
        var state_spec = spec.add('.state');
        var state = obj.toPojo(true);
        this.send(
            uplink,
            state_spec,
            state
        );
        this.storage && this.storage.deliver(spec.add('.state'), state, this);
    }

    var on = new Op(ev_spec.add('.on'), obj._version, this);
    this.deliver(on); // TODO ver 0

    // ask the storage to subscribe to the uplink (if any);
    // the storage may have log bookmarks for that uplink
    // this will produce a boot-up bundle for our object (base !0)
    if (uplink) {
        this.storage.deliver(ev_spec.add('.preon'), uplink, this);
    }

    return obj;
};

Host.prototype.unregisterSyncable = function (obj) {
    var typeid_spec = obj.spec();
    var id = obj._id;
    if (id in this.syncables) {
        delete this.syncables[id];
    }
    var off_spec = typeid_spec.add(this.time(),'!').add('.off');
    if (this.storage) {
        this.storage.deliver(off_spec, '', this);
    }
    if (id in this.uplink) {
        var src = this.getSource(this.uplink[id]);
        src && src.deliver(off_spec, '', this);
        delete this.uplink[id];
    }
};




Host.prototype.addSource = function hostAddpipe(spec, pipe) {
    var old = this.sources[pipe.id];
    if (old) {
        old.deliver(this.newEventSpec('off'), '', this);
    }

    this.sources[pipe.id] = pipe;
    for (var id in this.syncables) {
        this.linkUp(this.syncables[id].spec());
    }

    this.emit4({
        name: 'connect',
        spec: spec,
        id: pipe.id
    });
};


Host.prototype.dispatchHostHandshake = function (op, pipe) {
    switch (op.name) {
        case 'on':
            pipe.id = op.spec.id();  // TODO
            this.addSource(op.spec, pipe);
            var reon = op.spec.set(this.id,'#').set('.reon');
            pipe.deliver(reon, this.clock.ms(), this);
        break;
        case 'reon':
            pipe.id = op.id;  // TODO
            this.clock.adjustTime(op.value);
            this.addSource(op.spec, pipe);
        break;
        case 'off':
            pipe.deliver(this.newEventSpec('reoff'), '', this);
            this.removeSource(op.spec, pipe);
        break;
        case 'reoff':
            this.removeSource(op.spec, pipe);
        break;
        case 'error':
            console.error('error received from ', pipe.id, op.toString());
        break;
        default:
        throw new Error("no such thing allowed");
    }
};


/** A workaround for abnormal close cases (conn broken, etc) */
Host.prototype.onPipeClosed = function (pipe) {
    if (this.sources[pipe.id]===pipe) {
        // make up a synthetic .off event
        this.removeSource(this.newEventSpec('off'),pipe);
    }
};

Host.prototype.removeSource = function (spec, pipe) {
    if (!this.sources[pipe.id]) {return;} // removed already?

    if (this.sources[pipe.id] !== pipe) {
        throw new Error('pipe unknown: '+pipe.id);
    }

    delete this.sources[pipe.id];

    var relink = [];
    for(var id in this.uplink) {
        if (this.uplink[id] === pipe.id) {
            relink.push(id);
            delete this.uplink[id];
        }
    }
    for(var pu_id in this.pending_uplink) {
        if (this.pending_uplink[pu_id] === pipe.id) {
            relink.push(pu_id);
            delete this.pending_uplink[pu_id];
        }
    }
    while (relink.length) {
        var o = this.syncables[relink.pop()];
        o && this.linkUp(o.spec());
    }

    this.emit4({
        name: 'disconnect',
        spec: spec,
        id: pipe.id
    });

    pipe.close();
};

/**
 * Returns an unique Lamport timestamp on every invocation.
 * Swarm employs 30bit integer Unix-like timestamps starting epoch at
 * 1 Jan 2010. Timestamps are encoded as 5-char base64 tokens; in case
 * several events are generated by the same process at the same second
 * then sequence number is added so a timestamp may be more than 5
 * chars. The id of the Host (+user~session) is appended to the ts.
 */
 Host.prototype.time = function () {
    var ts = this.clock.issueTimestamp();
    this._version = ts;
    return ts;
};

Host.prototype.newEventSpec = function (evname) {
    var spec = new Spec('/Host').add(this.id,'#').add(this.time(),'!');
    return spec.add(evname,'.');
};

/** Spanning tree.
 * This default
 * implementation uses a simple consistent hashing scheme.
 * Note that a client may be connected to many servers
 * (pipes), so the uplink selection logic is shared.
 * Neither the server nor the storage depend on the particular CRDT
 * type logic so syncables are sorted by #id, irrespectively of their /type.
 */
Host.prototype.getUplink = function (id) {
    var mindist = 4294967295,
        reServer = /^swarm~/, // pipes, not clients
        target = env.hashfn(id),
        closestpipe = null;

    if (reServer.test(this.id)) { // just in case we're the root
        mindist = Host.hashDistance(this.id, target);
        closestpipe = null;
    }

    for (var src_id in this.sources) {
        if (!reServer.test(src_id) ) {
            continue;
        }
        var dist = Host.hashDistance(src_id, target);
        if (dist < mindist) {
            closestpipe = src_id;
            mindist = dist;
        }
    }
    return closestpipe;
};

Host.prototype.isUplinked = function () {
    for (var id in this.sources) {
        if (/^swarm~.*/.test(id)) {
            return true;
        }
    }
    return false;
};

Host.prototype.isServer = function () {
    return this._server;
};

function getUriProtocol (uri) {
    var m = uri.match(/^(\w+):.*/);
    if (!m) { throw new Error('invalid URI ' + uri); }
    return m[1].toLowerCase();
}

// waits for handshake from stream
// authorizer, serializer
Host.prototype.listen = function (url, options) {
    var self = this;
    options = options || {};
    var proto = getUriProtocol(url);
    var server_fn = env.servers[proto];
    if (!server_fn) {
        throw new Error('protocol unknown: '+proto);
    }
    var server = new server_fn(url, options);
    this.servers[url] = server;
    server.listen (url, function(error) {
        console.warn("listening on", url);
    });
    server.on('connection', function (stream) {
        var opts = {uri:url};
        for(var key in options) {
            opts[key]=options[key];
        }
        function pipeize (author) {
            opts.restrictAuthor = author;
            new Pipe (self, stream, opts);
        }
        if ('authorize' in options) {
            options.authorize (stream, pipeize);
        } else {
            pipeize(undefined);
        }
    });
};

// initiate handshake with a pipe
// authorizer, serializer
Host.prototype.connect = function (uri, opts) {
    var self = this;
    opts = opts || {};
    var proto = getUriProtocol(uri);
    opts.uri = uri;
    var client = new env.clients[proto](opts);
    client.connect(uri, function(error) {
        var pipe = new Pipe(self, client, opts);
        pipe.deliver(self.newEventSpec('on'), '');
    });
};

Host.prototype.disconnect = function (id, comment) {
    for(var i in this.sources) {
        var src = this.sources[i];
        if (!id || src.uri===id || src.id===id) {
            src.deliver(this.newEventSpec('off'), comment||'');
            src.close();
        }
    }
};

Host.prototype.close = function (cb) {
    for(var id in this.sources) {
        this.disconnect(id);
    }
    if (this.storage) {
        this.storage.close(cb);
    } else if (cb) {
        cb();
    }
};

Host.prototype.on4 = Syncable.prototype.on4;
Host.prototype.once4 = Syncable.prototype.once4;
Host.prototype.off4 = Syncable.prototype.off4;
Host.prototype.emit4 = Syncable.prototype.emit4;


/** accept/respond to the given stream
  * uplinks properly  after a handshake
  *  */
function Pipe (host, stream, options) {
    this.options = options || {};
    this.pending = [];
    this.id = null;
    this.closed = false;
    this.uri = options.uri;
    this.host = host;
    this.stream = stream;
    this.bound_flush = this.flush.bind(this);
    this.lastSendTime = 0;
    //this.serializer = options.serializer || LineBasedSerializer;
    if (options.keepAlive) {
        this.timer = setInterval(this.onTimer.bind(this), 1000);
    }
    this.stream.on('data', this.onStreamDataReceived.bind(this));
    this.stream.on('close', this.onStreamClosed.bind(this));
    this.stream.on('error', this.onStreamError.bind(this));
    options.maxSendFreq;
    options.burstWaitTime;
    env.logs.net && console.log(this.uri,'~',this.host.id, "pipe open");
}

Pipe.prototype.deliver = function (op) {
    this.pending.push(op);
    if (this.asyncFlush) {
        if (!this.flush_timeout) {
            var delay;
            this.flush_timeout = setTimeout(this.bound_flush, delay);
        }
    } else {
        this.flush();
    }
};

Pipe.prototype.flush = function () {
    if (this.closed) {return;}
    var parcel = this.pending.join('');
    this.pending = [];
    try {
        env.logs.net && console.log(this.id||'unknown','<',this.host.id, parcel);
        this.stream.write(parcel);
        this.lastSendTime = new Date().getTime();
    } catch(ioex) {
        console.error(ioex.message, ioex.stack);
        this.close();
    }
};

Pipe.prototype.onStreamDataReceived = function (data) {
    if (this.closed) { throw new Error('the pipe is closed'); }
    env.logs.net && console.log
        (this.id||'unknown','>',this.host.id, data.toString());
    var lines = data.toString().match(Op.op_re);
    var messages = lines.map(function(line){
        return Op.parse(line, this.id);
    });
    var author = this.options.restrictAuthor || undefined;
    for(var i=0; i<messages.length; i++) {
        var msg = messages[i];
        var spec = msg.spec;
        try {
            if (spec.isEmpty()) {
                throw new Error("malformed spec: "+snippet(lines[i]));
            }
            if (!/\/#!+\./.test(spec.pattern())) {
                throw new Error("invalid spec pattern: "+msg.spec);
            }
            if (author!==undefined && spec.author()!==author) {
                throw new Error("access violation"+msg.spec);
            }
            this.host.deliver(msg, this);
        } catch (ex) {
            var err_spec = spec.set('.error');
            this.deliver(err_spec, ex.message.replace(/\n/g,''));
            console.error('error processing '+spec, ex.message, ex.stack);
            this.close();
            break;
        }
    }
};

Pipe.prototype.onStreamClosed = function () {
    if (!this.closed) {
        this.close();
    }
};

Pipe.prototype.onStreamError = function (err) {
    console.error('stream error', this.id, err);
};

Pipe.prototype.onTimer = function () {
    if (!this.id && !this.closed) {
        this.close();
    }    // health check
    // keepalive prevents the conn from being killed by overly smart middleboxes
    // and helps the server to keep track of who's really online
    if (this.options.keepAlive) {
        var time = new Date().getTime();
        var silentTime = time - this.lastSendTime;
        if (silentTime > (this.options.keepAliveInterval||50000)) {
            this.flush();
        }
    }
    if (ok) {
        this.options._delay = undefined;
    }
};

Pipe.prototype.close = function () {
    if (this.closed) {return;}
    this.closed = true;
    this.host.onPipeClosed(this);
    this.flush();
    env.logs.net && console.log(this.uri,'~',this.host.id, "pipe closed");
    clearInterval(this.timer);
    try{
        this.stream.close();
    } catch (ex) {
        console.warn('it does not want to close', ex);
    }
    var host = this.host;
    var opts = this.options;
    if (opts.reconnect) {
        opts._delay = opts._delay || opts.reconnectDelay || 500;
        opts._delay <<= (opts.reconnectBackoff||2);
        console.log('reconnect planned');
        setTimeout(function (){
            console.log('reconnect');
            host.connect(opts.uri, opts);
        }, opts._delay);
    }
};


function snippet (o) {
    return (o||'<empty>').toString().replace(/\n/g,'\\n').substr(0,50);
}
