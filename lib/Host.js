'use strict';

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
    this.id = id;
    this.storage = storage || new Storage();
    this.storage.id = this.id + '~' + this.storage.ssnSuffix;
    this._server = /^swarm~.*/.test(id);

    this.clock = env.clock || new SecondPreciseClock(this.id, ms||0);

    this.syncables = {};
    this.subscriptions = {};

    this.pipes = {};
    this.anyid2peerid = {};
    this.servers = {};

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
*   (4) log horizon/compaction/wtw @Storage
*/

/** The primary op routing function */
Host.prototype.deliver = function (op, pipe) {

    if (op.constructor!==Op) {
        throw new Error('ops only');
    }
    //var op = new Op(spec, value, source&&source.id);

    env.logs.host && console.log((op.source||'unknown')+'>'+this.id, op.toString());

    if (op.spec.type() === 'Host') { // handshake from a (remote) Host
        return this.dispatchHostHandshake(op, pipe);
    }

    var send = [], store = [];

    var id = op.id();
    var ti = op.spec.filter('/#'); // TODO id only

    var sub = this.subscriptions[ti];

    if (!sub) {
        //if (op.op()!=='on') { // the peer screwed up its state machine
        //    throw new Error('object unknown');
        //}   FIXME gc gc gc gc gc gc
        sub = this.subscriptions[ti] = new Subscription(id);
        var uplink = this.getUplink(id);
        uplink && this.linkTo(ti, uplink, send, store);
    }

    if (pipe===this.storage) { // own storage
        sub.dispatchStorageOp(op, send, store);
    } else {
        sub.dispatchRemoteOp(op, send, store);
    }

    this.store(store);
    this.send(send);

};


function Subscription (id) {
    this.uplink = null;
    this.links = null;
    this.pending_ons = null;
    this.pending_reon = null;
}
// Once a handshake is completed (.bundle, .reon) a peer host starts
// listening to object's new ops (we add it to this.links[id]).
// On .off received or connection breakage we remove the entry.
// Once we start tracking an object we join its spanning tree.
// Triggered by an incoming .on or local new Syncable(), link()
// calculates the uplink for the object, sends out .on and puts
// pipe id in this.unlinks.
// Later on handshake completion, the same pipe id gets listed
// in this.links.
// The entry is overwritten on uplink departure/arrival, removed
// by uplink() (triggered by an incoming .off or local gc()).
// --Incoming .on/.reon operations are forwarded (to Storage, uplink,
// downlink) to receive a response (a .bundle, maybe an empty one).
// Such pending ops are remembered to forward the response back.
// A bundle clears pending state, creates linked state (this.links)


Subscription.prototype.dispatchRemoteOp = function (op, send, store) {
    if (!op.source) {
        throw new Error('handshake first');
    }
    //if ( (op.op() in Op.handshake_ops) && op.stamp() !== op.source ) {
    //    throw new Error('misleading time stamp');
    //}  what about the response?
    switch (op.op()) {
    case 'on':     this.remoteOn(op, send, store); break;
    case 'reon':   this.remoteReOn(op, send, store); break;
    case 'bundle': this.remoteBundle(op, send, store); break;
    case 'off':    this.remoteOff(op, send, store); break;
    case 'reoff':  this.remoteReOff(op, send, store); break;
    case 'state':  this.remoteState(op, send, store); break;
    case 'error':  this.remoteError(op, send, store); break;
    default:       this.remoteOp(op, send, store); break;
    }
};

Subscription.prototype.dispatchStorageOp = function (op, send, store) {
    switch (op.op()) {
    case 'on':     this.storageOn(op, send, store); break;
    case 'reon':   this.storageReOn(op, send, store); break;
    case 'bundle': this.storageBundle(op, send, store); break;
    case 'error':  this.storageError(op, send, store); break;
    default:       this.storageOp(op, send, store); break;
    }
};

// FIXME check op.stamp matches pipe_id / peer_pipe_id
// TODO:  RELAY BEHAVIOR (just skip db)

Subscription.prototype.remoteOn = function (op, send, store) {
    // finally, neatly consolidated on/reon/off/reon code
    if (!this.pending_ons) { this.pending_ons = []; }
    this.pending_ons.push(op);
    // TODO unless fwd
    store.push(op);

};


Subscription.prototype.remoteReOn = function (op, send, store) {
    if (op.stamp()!==this.uplink) { // TODO shortcuts
        return; // unclear, but we must have unsubscribed already
    }
    // look for incoming subscriptions still pending
    var pending = this.pending_ons;
    if (pending) { // the uplink sent us no state then
        this.pending_reon = op;
        for(var p=0; p<pending.length && !pending[p].value; p++);
        if (p<pending.length) { // ask the downlink that has the state
            send.push(pending[p].respond('reon', ''));
            pending.splice(p,1);
        } else { // we give up, ask all downlink(s) for the state
            this.pending_ons = null;
            pending.forEach(function(o){
                send.push(o.response('reon',''));
            });
        }
    } else {  // we have the state, ask the storage to make a bundle
        store.push(op);
    }
};


Subscription.prototype.remoteBundle = function (op, send, store) {
    store.push(op);
    // resubmit pending subscriptions, if any
    if (this.pending_ons) {
        this.pending_ons.forEach(function(po){
            store.push(po);
        });
        this.pending_ons = null;
    }
    if (this.pending_reon) {
        store.push(this.pending_reon);
        this.pending_reon = null;
    }
};

Subscription.prototype.remoteOff = function (op, send, store) {
    // remove from subscribers; gc and uplink.off if none left
    if (this.links) {
        var i = this.links.indexOf(op.source);
        i!==-1 && this.links.splice(i,1);
    }
    send.push(op.respond('reoff')); // always confirm
};

// the uplink does not listen anymore
Subscription.prototype.remoteReOff = function (op, send, store) {
    // TODO this.gc(spec);
    if (op.source===this.uplink) {
        this.uplink = null;
    }
    if ( this.links ) {
        var i = this.links.indexOf(op.source);
        i!==-1 && this.links.splice(i, 1);
        if (this.links.length===0) { this.links = null; }
    }
};

Subscription.prototype.remoteState = function (op, send, store) {
    // ACLs are kept by the Storage; Host does routing, as
    // stateless as possible
    store.push(op);
    /*if (op.version()===op.id()) {// state push (no subscription)
    } else {// apart from state push, states only go inside bundles
        send.push(op.respond('error', 'orphan state'));
    }*/
};

Subscription.prototype.remoteError = function (op, send, store) {
    console.error(op.spec.toString(), op.value);
};

// a regular operation that will somehow modify the state
Subscription.prototype.remoteOp = function (op, send, store) {
    store.push(op);
};

// a hinted .on from the storage arrives
Subscription.prototype.storageOn = function (op, send, store) {
    if (this.uplink!==op.stamp()) {
        return; // by the time the .on arrived, the connection is gone
    }
    send.push( op.relay(this.uplink) ); // .on
};

Subscription.prototype.storageReOn = function (op, send, store) {
    if (!op.value) {
        return; // wait for state arrival to give a meaningful response
    } else { // subscribe back to the original source
        send.push(op.relay(op.stamp())); 
    }
};

Subscription.prototype.storageBundle = function (op, send, store) {
    // the client should receive ops now => put it on the list
    /*if (!this.pending_ons) {
        console.warn('no pending subscription', ''+op.spec);
        return;
    }*/
    var stamp = op.stamp();
    send.push(op.relay(stamp));
    if (this.pending_ons) {
        var clear = this.pending_ons.filter(function(o){
            return o.stamp() !== stamp;
        });
        this.pending_ons = clear.length ? clear : null;
    }
    // Once the peer replica state is made equal to our state,
    // all the new ops must be relayed to keep it up to date.
    // In other words, that replica joins our subtree.
    if (!this.links) { this.links = []; }
    if (this.links.indexOf(stamp)===-1) {
        this.links.push(stamp);
    } else {
        console.warn('repeated subscription', ''+op.id());
    }
};


Subscription.prototype.cleanUp = function (op, send, store) {
    // FIXME clean-up on disconnection + SOME CONNs ARE CLOSED
};

// the storage says it is a new op => relay it
Subscription.prototype.storageOp = function (op, send, store) {
    // This will echo a new op back to its source.
    // In some cases (server2client) we may need that as
    // an acknowledgement. In other cases (host2logix,
    // client2server) we'd better supress it. FIXME
    for(var i=0; this.links && i<this.links.length; i++) {
        var link = this.links[i];
        if (link===op.source) { // we may skip echo sometimes
            // don't echo to the logix
            if (link==='0') { continue; }
            // TODO don't echo it up
        }
        send.push(op.relay(link));
    }
};

Subscription.prototype.storageError = function (op, send, store) {
    // ? shut everything down
    console.error('storage error', op.toString());
};

//     var preonspec = op.spec.set(this.time(),'!').set('.on');

/**
 *
 * Uplink connections may be closed or reestablished so we need
 * to adjust every object's subscriptions time to time.
 */
Host.prototype.linkTo = function (ti, pipe_id, send, store) {
    var sub = this.subscriptions[ti];
    if (sub.uplink===pipe_id) {
        return; // it's OK
    }
    if (sub.uplink) {
        var off = ti.add(sub.uplink,'!').add('.off');
        send.push(new Op(off, '', sub.uplink));
        sub.uplink = null;
    }
    if ( pipe_id ) {
        var peer_id = this.anyid2peerid[pipe_id];
        var pipe = this.pipes[peer_id];
        var preon = ti.add(pipe.pipe_id,'!').add('.preon');
        sub.uplink = pipe.pipe_id; // prevent repetitions
        store.push( new Op(preon, pipe.id, '0') );
        //if (op.value==='') { // we have no state, so take a shortcut
        //    this.send( uplink, new Op(upspec.add('.on'), '', this) );
        //} else { // hint the storage to send an .on
        // ask the storage to subscribe to the uplink (if any);
        // the storage may have log bookmarks for that uplink
        // this will produce a boot-up bundle for our object (base !0)
        //}
    }
};


/** Incoming subscription, essentially a read request for an object.
  * Read for them is write for us (READ=WRITE^-1).
  * Normally, an `.on` is received from  a downlink (client), sometimes
  * from a shortcut (peer) connection. `.on` is reciprocated with
  * `.reon` in case the source has write rights (i.e. may author ops). */


/**  {.reon: !version} {.reon: ''} {.reon: !0} {.reon: !~~~~~} */


/** Bundles are groups of operations related to the same object. Those are
 * sent to achieve pseudo-atomicity (when sending a log tail) or as a
 * performance optimization.
 */

/** A state bootstraps a local object replica. State+log is classics.
  * http://en.wikipedia.org/wiki/State_machine_replication
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
    var ons = this.pending_s_downlinks[id];
    if (ons) { // unfreeze subscriptions
        var self = this;
        ons.forEach( function(pon) {
            var src = self.sources[pon.source];
            src && self.deliver(new Spec(pon.spec), pon.value, src);
        } );
        delete this.pending_s_downlinks[id];
    }
};*/


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


Host.prototype.send = function send (ops) {
    for(var i=0; i<ops.length; i++) {
        var op = ops[i];
        if (op.source==='0') {
            var obj = this.syncables[op.id()];
            if (obj) {
                obj.deliver(op);
            } else {
                console.warn('no such syncable', op.id(), ''+op);
            }
        } else {
            var peer_id = this.anyid2peerid[op.source];
            var pipe = this.pipes[peer_id];
            if (pipe) {
                pipe.deliver(op);
            } else {
                console.warn('op sent to nowhere', ''+op, op.source);
            }
        }
    }
};

Host.prototype.store = function (ops) {
    for(var i=0; i<ops.length; i++) {
        this.storage.deliver(ops[i]);
    }
};


//      PAIN POINTS:    uplink assignment cycle
//          * new    X
//          * preon/on
//          * removeSource   X
//          * addSource    X
//          * off/reoff
//          * cleaning up closed conns
//          * registerSyncable
//          * unregisterSyncable
//          * uplinks / relinking for fwd subs
//      ISSUE: connection list is at Host
//      ISSUE: scanning all links[] is too expensive
//      ISSUE: addSource needs a full scan (lots of subs, wht if it fails)
//              don't unsubscribe till the new one is functional (?)
    // TODO .4 no own storage => .off everyone to re-handshake




Host.prototype.gc = function (spec) {
    /*if (links.length===0 && !(id in this.syncables)) { // gc() ?
        delete this.links[id];
        var uplink = this.uplink[id];
        this.send(uplink,spec.set('.off'));
        delete this.uplink[id];
    }*/
};

Host.prototype.linkSyncable = function (spec, obj) {
    var id = spec.id();
    if (id in this.syncables) { // FIXME types
        return this.syncables[id]; // there is such an object already
    }
    this.syncables[id] = obj;  // OK, remember it
    // for newly created objects, the state is pushed ahead of the
    // handshake as the uplink certainly has nothing
    if (obj._id===obj._version.substr(1)) {
        var state = JSON.stringify(obj.toPojo(false));
        var ev_spec = obj.spec().add(obj._id,'!').add('.state');
        this.storage.deliver(new Op(ev_spec, state, '0'));
    }
    // unify local and remote subscriptions
    var on = new Op(obj.spec().add('!0').add('.on'), obj._version, '0');
    this.deliver(on);
    return obj;
};

Host.prototype.unlinkSyncable = function (obj) {
    var id = obj._id;
    if (id in this.syncables) {
        if (this.syncables[id]!==obj) {
            throw new Error('the registered object is different');
        }
        delete this.syncables[id];
        var off_spec = obj.spec().add('!0').add('.off');
        this.deliver(new Op(off_spec, '', '0'));
    }
};



Host.prototype.dispatchHostHandshake = function (op, pipe) {
    // We identify subscriptions (links) by their pipe ids
    // to avoid ABA effects (subsribed to a pipe which got reopened).
    // Pipes guarantee operation arrival order, so we can't
    // be any smarter than to open every subscription on a 
    // new pipe (can't reuse old subs on a new pipe).
    // Outgoing handshakes use pipe_id (local timestamp).
    // Incoming handshakes use peer_pipe_id (remote timestamp).
    // So, sub.uplink is a local timestamp, which is bad for
    // debugging. Check this.pipes[sub.uplink].id then.
    // sub.links are remote timestamps, much easier to read.
    // P.S. local subscriptions have pipe id '0'
    switch (op.name) {
    case 'on':    this.hostOn(op, pipe);   break;
    case 'reon':  this.hostReOn(op, pipe);   break;
    case 'off':   this.hostOff(op, pipe);   break;
    case 'reoff': this.hostReOff(op, pipe);   break;
    case 'error': this.hostError(op, pipe); break;
    default:      throw new Error('no such thing allowed');
    }
};


//   /Host#swarm!time+peer~ssn.on .reon .off .reoff
Host.prototype.hostOn = function (op, pipe) {
    pipe.peer_pipe_id = op.stamp();
    pipe.id = op.id();
    // send a response
    var reon = this.newEventSpec('reon');
    pipe.pipe_id = reon.version();
    pipe.deliver(new Op(reon, this.clock.ms()));
    // relink subscriptions, etc
    this.addPipe(op.spec, pipe);
};

Host.prototype.hostReOn = function (op, pipe) {
    pipe.id = op.id();  // TODO
    pipe.peer_pipe_id = op.stamp();
    this.clock.adjustTime(op.value);
    this.addPipe(op.spec, pipe);
};

Host.prototype.hostOff = function (op, pipe) {
    pipe.deliver(new Op(this.newEventSpec('reoff'), '', this.id));
    this.removePipe(op.spec, pipe);
};

Host.prototype.hostReOff = function (op, pipe) {
    this.removePipe(op.spec, pipe);
};

Host.prototype.hostError = function (op, pipe) {
    console.error('handshake fails', op.toString());
};

/** A workaround for abnormal close cases (conn broken, etc) */
Host.prototype.onPipeClosed = function (pipe) {
    if (this.pipes[pipe.peer_pipe_id]===pipe) {
        // make up a synthetic .off event
        this.removePipe(this.newEventSpec('off'), pipe);
    }
};


Host.prototype.addPipe = function hostAddPipe(spec, pipe) {
    // by this time, pipe_id, peer_pipe_id are known
    // FIXME check all kinds of consistency
    if (pipe.auth && spec.id()!==pipe.auth) { // TODO id or stamp?
        throw new Error('not authenticated');
    }
    var source = spec.source(); 
    var peer_id = pipe.peer_pipe_id;

    // replacement is different from removal, mostly because
    // we don't want to change all subscriptions twice
    var old_peer_id = this.anyid2peerid[source];
    if (old_peer_id) {
        var old = this.pipes[old_peer_id];
        old.deliver( new Op(this.spec().add(old.pipe_id,'!').add('.off')) );
        delete this.anyid2peerid[source];
        delete this.anyid2peerid[old.pipe_id];
        delete this.anyid2peerid[old.peer_pipe_id];
        delete this.pipes[old_peer_id];
        old.close();
    }
    this.pipes[peer_id] = pipe;
    this.anyid2peerid[source] = peer_id;
    this.anyid2peerid[peer_id] = peer_id;
    this.anyid2peerid[pipe.pipe_id] = peer_id;

    // TODO all these indexes (add/clear)

    // necessarily, a full scan to detect which ones to subscribe
    this.relink(undefined);

    this.emit4({
        name: 'connect',
        spec: spec,
        id: pipe.id,
        pipe: peer_id
    });
};


Host.prototype.removePipe = function (spec, pipe) {
    var peer_id = pipe.peer_pipe_id;
    var source = pipe.id;
    if (!this.pipes[peer_id]) {
        return; // removed already?
    }

    if (this.anyid2peerid[source] !== peer_id) {
        throw new Error('undead pipe: '+peer_id);
    }
    delete this.pipes[peer_id];
    delete this.anyid2peerid[source];
    delete this.anyid2peerid[pipe.pipe_id];
    delete this.anyid2peerid[peer_id];
    pipe.close();

    this.relink(peer_id);

    this.emit4({
        name: 'disconnect',
        spec: spec,
        id: source,
        pipe: peer_id
    });

};


Host.prototype.relink = function (pipe_id) {
    var send = [], store = [];

    for (var id in this.subscriptions) {
        var sub = this.subscriptions[id];
        if (pipe_id && sub.uplink!==pipe_id) {continue;}
        var up_src = this.getUplink(id);
        var conn = this.src2conn[up_src];
        if (sub.uplink!==conn) {
            // CREATE A GIANT OP QUEUE
            this.link(id, conn, send, store);
        }
    }

    this.store(store);
    this.send(send);
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

    for (var peer_id in this.pipes) {
        var pipe = this.pipes[peer_id];
        var src_id = pipe.id; 
        if ( !reServer.test(src_id) ) {
            continue;
        }
        var dist = Host.hashDistance(src_id, target);
        if (dist < mindist) {
            closestpipe = peer_id;
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
        console.warn('listening on', url);
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
        var on = self.newEventSpec('on');
        pipe.pipe_id = on.version();
        pipe.deliver(new Op(on, '', self.id));
    });
};

Host.prototype.disconnect = function (id, comment) {
    for(var i in this.sources) {
        var src = this.sources[i];
        if (!id || src.uri===id || src.id===id) {
            src.deliver(new Op(this.newEventSpec('off'), comment||'', this.id));
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
    this.pending_s = [];
    this.id = null;
    this.pipe_id = null;
    this.peer_pipe_id = null;
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
    this.pending_s.push(op);
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
    var parcel = this.pending_s.join('');
    this.pending_s = [];
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
    var self=this;
    if (this.closed) { throw new Error('the pipe is closed'); }
    data = data.toString();
    env.logs.net && console.log
        (this.id||'unknown','>',this.host.id, data);
    if (!data) {return;} // keep-alive
    var lines = data.match(Op.op_re);
    if (!lines) {
        this.deliver(new Op('/Host#'+this.host.id+'.error', 'bad msg format'));
        return;
    }
    var messages = lines.map(function(line){
        return Op.parse(line, self.id);
    });
    var author = this.options.restrictAuthor || undefined;
    for(var i=0; i<messages.length; i++) {
        var msg = messages[i];
        var spec = msg.spec;
        try {
            if (spec.isEmpty()) {
                throw new Error('malformed spec: '+snippet(lines[i]));
            }
            if (!/\/?#!*\./.test(spec.pattern())) {
                throw new Error('invalid spec pattern: '+msg.spec);
            }
            if (author!==undefined && spec.author()!==author) {
                throw new Error('access violation: '+msg.spec);
            }
            this.host.deliver(msg, this);
        } catch (ex) {
            var err_spec = spec.set('.error');
            //this.deliver(new Op(err_spec, ex.message.replace(/\n/g,'')));
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
