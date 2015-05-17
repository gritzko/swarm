"use strict";

var env = require('./env');
var Spec = require('./Spec');
var Syncable = require('./Syncable');
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
    this.sources = {};
    this.storage = storage;
    this.id = id;
    if (storage) {
        storage.id = this.id + '~' + storage.ssnSuffix;
        //this.sources[storage.id] = storage;
    }
    this._server = /^swarm~.*/.test(id);
    var clock_fn = env.clockType || SecondPreciseClock;
    this.clock = new clock_fn(this.id, ms||0);

    // Once a handshake is completed (.bundle sent) a peer host starts
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
    this.pending = {}; // { /T#id!ver : {value, source_id} }

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
Host.prototype.deliver = function (spec, value, source) {

    var self = this;
    var id = spec.id();
    var op = spec.op();
    var stamp = spec.version();
    var object;

    env.logs.op && console.log(
        (env.multihost?'@'+this.id:''),
        spec.toString(), value, source&&source.id?'('+source.id+')':'');


    // HANDSHAKE vs PIPE vs OBJECT vs STORAGE
    // Pipe: to uplink(relay) or to storage
    // Storage: fanout (some go to uplink)
    // Object: to storage.
    if (!source) { // locally originated

        switch (op) {
            case 'on':    return this.registerSyncable(spec, value); break;
            case 'reon':  throw new Error('impossible'); break;
            case 'off':   return this.unregisterSyncable(spec, value); break;
            case 'reoff': throw new Error('impossible'); break;
            case 'error': console.error(spec, value); break;
            default:      this.storage.deliver(spec, value, this);
        }

    } else if (spec.type() === 'Host') { // handshake from a (remote) Host

        switch (op) {
            case 'on':    this.onHandshake (spec, value, source); break;
            case 'reon':  this.onHandshakeResponse (spec, value, source); break;
            case 'off':   this.onGoodbye (spec, value, source); break;
            case 'reoff': this.onGoodbyeResponse (spec, value, source); break;
            case 'error': this.onError (spec, value, source); break;
            default:      throw new Error("!!!");
        }

    } else if (source.constructor===Pipe) { // remote host

        if (!source.id) {
            throw new Error('handshake first');
        }

        // TODO:  SEPARATE SWITCH FOR RELAY BEHAVIOR
        // consistent hashing ring
        // don't send it to our storage
        // forward, send response back: handshakes to the source,
        // ops by the tree
        /*if (this.isServer() && !this.isRootFor(id)) {
            // handshake => remember src || send to src (add to the tree)
            // regular => to uplink or by the tree

            // forward the op, maybe remember teh source

        }*/

        // finally, neatly consolidated on/reon/off/reon code
        switch (op) {
            // have data => respond immediately; subscripe to the uplink
            // if not yet (create a pending subscription)
            case 'on':
            this.pending[stamp] = {spec:spec, value: null, source:source.id};
            this.storage.deliver (spec, value, source);
            break;
            // remove from subscribers; gc and uplink.off if nobody left
            case 'off':   this.onUnsubscription(spec,value,source); break;
            // request a .bundle from the storage
            case 'reon':  this.storage.deliver(spec,value,source); break;
            case 'reoff': this.onReciprocalUnsubscription(spec,value,source);
                          break;
            case 'bundle':if (spec.source()===this.id) {
                              this.storage.deliver(spec, value);
                          } else {
                              var pending = this.pending[stamp];
                              pending && this.send(pending.source, spec, value);
                          }
                          break;
            // states can be sent without any subscription (state push)
            case 'state': this.storage.deliver(spec,value,source); break;
            default:      this.storage.deliver(spec,value,source); break;
        }

    } else if (source===this.storage) { // own storage

        switch (op) {

            case 'on': // a hinted .on from the storage
            var uplink = this.getUplink(spec);
            this.send(uplink, spec, value);
            break;

            case 'reon': // subscribe back; resolves a pending subscription
            pending = this.pending[stamp];
            pending && this.send(pending.source, spec, value);
            delete this.pending[stamp];
            break;

            case 'bundle': // the client should read ops now => put on the list
            if (spec.source()===this.id) {
                object = this.syncables[id];
                object && object.deliver(spec, value, source);
            } else {
                pending = this.pending[stamp];
                if (pending) {
                    this.send(pending.source, spec, value);
                    links = this.links[id];
                    if (!links) { links = this.links[id] = []; }
                    links.push(pending.source); // TODO repeats
                }
            }
            break;

            default: // the storage says it is a new op => relay it
            var links = this.links[id] || [];
            if (spec.source()!==this.id) {
              var obj = this.syncables[id];
              obj && obj._version && obj.deliver(spec, value);
            }
            links.forEach(function(id){
              self.send(id, spec, value);
            });
            break;
        }

    } else {
        throw new Error("unrecognized source");
    }

};

/** A regular operation that will somehow modify the state.
  * The logics knows better. */
Host.prototype.onOp = function (spec, value, source) {

};

/** Incoming subscription, essentially a read request for an object.
  * Read for them is write for us (READ=WRITE^-1).
  * Normally, an `.on` is received from  a downlink (client), sometimes
  * from a shortcut (peer) connection. `.on` is reciprocated with
  * `.reon` in case the source has write rights (i.e. may author ops). */
Host.prototype.onSubscription = function (spec, base, source) {
    var id = spec.id();
    var key = spec.filter('/#!');
    this.pending[key] = {base:base, source:source.id};
    // it either goes to the storage or to the uplink
    var next = null; // myself (storage)
    if (!this.storage || (this.isServer())) {
        next = this.getUplink(id);
    }
    this.send(next, base, source);
};

/**  {.reon: !version} {.reon: ''} {.reon: !0} {.reon: !~~~~~} */
Host.prototype.onReciprocalSubscription = function (spec, base, source) {
    var id = spec.id();
    var key = spec.filter('/#!');
    // validate: uplink or storage
    if (!this.uplink[id] && source && source===this.storage) {
        var fork_spec = this.newEventSpec('on');
        var uplink = this.getUplink(id);
        this.uplink[id] = uplink;
        this.send(uplink, fork_spec, base, source);
    }
    // .reon always a response so deliver it to the original source
    var pending = this.pending[key];
    pending && this.send(pending.source, spec, base, source); // FIXME o
    delete this.pending[key];
};

Host.prototype.onBundle = function (spec, bundle, source) {
    // FROM: uplink, downlink, storage
    //       any -> storage => storage may take ops
    //       storage -> any => any may take ops
    //       any -> other => same
    var id = spec.id();
    var key = spec.filter('/#!');
    var pending = this.pending[key];
    if (pending) {
        // we don't respond to the client if we have nothing to respond
        this.send(pending.source, spec, bundle, source);
        var links = this.links[id];
        if (links) {
            if (pending.source===this.id) {
                // fan it out somehow
            }
        } else {
            this.links[id] = links = [];
        }
        // !!!! receive new ops
        if (links.indexOf(pending.source)===-1) {
            links.push(pending.source);
        }
        //delete this.pending[key]; wait for .reon
    } else {
        var o = this.syncables[id];
        if (o && !o._version) { // FIXME tail
            o.deliver(spec, bundle, source);
        } else {
            throw new Error('seems like an unsolicited bundle');
        }
    }
};


/** An incoming unsubscription from someone who has subscribed previously. */
Host.prototype.onUnsubscription = function (spec, reason, source) {
    var id = spec.id();
    var links = this.links[id];
    links.splice();
    // uplink initiates  re-handshake   otherwise error
    if (id === this.uplink[id] && links.length && !value) {
        this.linkUp(spec);
    } else {
        this.gc(spec);
    }
};


/** Now, the other side does not listen either. May also be triggered by a
  * revocation of write rights. (TODO) */
Host.prototype.onReciprocalUnsubscription = function (spec, value, source) {
    var id = spec.id();
    if (this.uplink[id]===source.id) {
        delete this.uplink[id];
        var links = this.links[id], i;
        if ( links && -1!==(i=links.indexOf(source.id)) )  {
            links.splice(i, 1);
        }
        if (links && links.length) {
            this.linkUp(spec);
        }
    } else {
        0; // we have relinked this object already
    }
};

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
        throw new Error('invalid spec');
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


Host.prototype.send = function send (src_id, spec, value, orig_source) {
    var src = this.sources[src_id];
    src && src.deliver(spec, value||'', orig_source||this);
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
            this.send(pending, o.spec().add(this.time(),'!').add('.off'));
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
    if (links.length===0 && !(id in this.syncables)) { // gc() ?
        delete this.links[id];
        var uplink = this.uplink[id];
        this.send(uplink,spec.set('.off'));
        delete this.uplink[id];
    }
};

Host.prototype.registerSyncable = function (spec, obj) {
    var ev_spec = obj.spec().add(spec.version()||this.time(),'!');
    var id = spec.id();
    if (id in this.syncables) {
        return this.syncables[id];
    }
    this.syncables[id] = obj;
    // for newly created objects, the state is pushed ahead of the
    // handshake as the uplink has nothing, we know that already
    if (obj._id===obj._version.substr(1)) {
        var uplink = this.getUplink(id);
        var state_spec = spec.add('.state');
        var state = obj.toPojo(true);
        this.send(
            uplink,
            state_spec,
            state
        );
        this.storage && this.storage.deliver(spec.add('.state'), state, this);
    }

    //this.linkUp(ev_spec); // <<< only this!!!! .4
    var on_spec = ev_spec.add('.on');
    var version = obj.version().toString(); // this must be '' actually
    if (this.storage) {
        this.storage.deliver(on_spec, version, this);
        // normally, we get a response from the storage first so
        // we can ask the uplink for a diff to the data we have
    } else {
        // but in case we have no storage we ask the uplink directly
        uplink = this.getUplink(id);
        uplink && this.send(uplink, on_spec, version, this);
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

Host.prototype.onHandshake = function hostOn(spec, filter, source) {
    source.id = spec.id();  // TODO
    this.addSource(spec, source);
    source.deliver(spec.set(this.id,'#').set('.reon'), this.clock.ms(), this);
};

Host.prototype.onHandshakeResponse = function hostReOn(spec, ms, source) {
    source.id = spec.id();  // TODO
    this.clock.adjustTime(ms);
    this.addSource(spec, source);
};

Host.prototype.onGoodbye = function (spec, nothing, pipe) {
    pipe.deliver(this.newEventSpec('reoff'), '', this);
    this.removeSource(spec, pipe);
};

Host.prototype.onGoodbyeResponse = function hostReOff(spec, nothing, pipe) {
    this.removeSource(spec, pipe);
};

Host.prototype.onError = function (spec, value, source) {
    console.error('error received from ', source.id, spec.toString(), value);
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
    this.serializer = options.serializer || LineBasedSerializer;
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

Pipe.prototype.deliver = function (spec, value) {
    this.pending.push({spec:spec.toString(), value:value});
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
    var parcel = this.serializer.serialize(this.pending);
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
    var messages = this.serializer.parse(data);
    var author = this.options.restrictAuthor || undefined;
    for(var i=0; i<messages.length; i++) {
        var msg = messages[i];
        var spec = new Spec(msg.spec);
        try {
            if (spec.isEmpty()) {
                throw new Error("invalid spec: "+msg.spec);
            }
            if (!/\/#!+\./.test(spec.pattern())) {
                throw new Error("invalid spec pattern: "+msg.spec);
            }
            if (author!==undefined && spec.author()!==author) {
                throw new Error("access violation"+msg.spec);
            }
            this.host.deliver(spec, msg.value, this);
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


/** JSON is native to JavaScript; unfortunately, it breaks ordering */
var JsonSerializer = {
    parse: function (data) {
        var json = JSON.parse(data.toString());
        var specs = [], ret=[];
        for(var s in json) { specs.push(s); }
        specs.sort().reverse();
        while (specs.length) {
            var s = specs.pop();
            ret.push({
                spec: new Spec(s),
                value: json[s]
            });
        }
        return ret;
    },
    serialize: function (data) {
        var json = {};
        for(var i=0; i<data.length; i++) {
            json[data[i].spec] = data[i].value;
        }
        return JSON.stringify(json);
    }
};

var LineBasedSerializer = {
    parse: function (data) {
        var ops = [], m;
        var str = data.toString();
        var line_re = LineBasedSerializer.line_re;
        line_re.lastIndex = 0;
        while (line_re.lastIndex<str.length && (m=line_re.exec(str))) {
            ops.push({
                spec: m[1],
                value: m[2]
            });
        }
        if (line_re.lastIndex!==str.length) {
            console.error('malformed data:',data);
            throw new Error('malformed data');

        }
        return ops;
    },
    serialize: function (ops) {
        var data = '';
        for(var i=0; i<ops.length; i++) {
            var op = ops[i];
            if (/\.bundle$/.test(op.spec)) { // FIXME semantics inside serializ
                data += op.spec + '\n';
                var bundle = op.value;
                for(var j=0; j<bundle.length; j++) {
                    var inner_op = bundle[j];
                    data += '\t' + inner_op.spec + '\t' + inner_op.value + '\n';
                }
            } else {
                data += op.spec + '\t' + op.value + '\n';
            }
        }
        return data;
    }
};
Host.LineBasedSerializer = LineBasedSerializer;
LineBasedSerializer.line_re = /^(\S+)\s+(.*(?:\n\s+.*)*)\n/g;
