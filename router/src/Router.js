'use strict';

var stream_url = require('stream-url');
var stamp = require('swarm-stamp');
var sync = require('swarm-syncable');
var Spec = sync.Spec;
var Op = sync.Op;
var Syncable = sync.Syncable;
var OpStream = sync.OpStream;
var util         = require("util");
var EventEmitter = require("events").EventEmitter;

//var SecondPreciseClock = require('./SecondPreciseClock');

/** Swarm has three orthogonal parts: Logics, Router and Storage.
 * Storage is a key-value db for operation logs (op logs).
 * Logics is a world of syncable CRDT syncables that consume ops.
 * Router deals with object subscriptions and op forwarding.
 *
 * Practically, a Router is a client (browser/mobile) or a server process.
 * Differently from other classes of systems, Swarm deals with
 * per-object subscriptions so a developer may use an arbitrary
 * collection of "live" replicated syncables (syncables) on the
 * client side. The resulting (asynchronous!) message exchange
 * patterns are quite complicated: per-object subscriptions,
 * operation forwarding, secondary clients, relinking to maintain
 * a consistent hashing ring etc.
 * Router focuses exactly on that part of the problem, so the Storage
 * may stay key-value dumb and Logics may be mathematically pure.
 * Router maintains local clocks and, generally, glues it all together.
 */
// Primary function: serving handshakes
 // Unified local and remote subscriptions:
 //   !0 fictive subscription (like we are root, but send a preon)
 //   !0+myself subscription by the local logix ("zero pipe")
 //   !time+peer incoming (downstream) pipe subscription
 //   !time+myself outgoing (upstream) subscription

//  ROUTING, HANDSHAKES, RING, TREE
//  CONTACTS: STORAGE

// clock: config or null
// ssn_id: config or null
// db_id
// db: (wrap)
// listen_url
function Router (options) { //(id, ms, storage) {
    EventEmitter.call(this);
    this.options = options;

    this.ssn_id = null;
    this.db_id = null;
    this.clock = null;

    this.subscriptions = {};
    // peer_pipe_id keyed pipes
    this.peers = {};
    // local pipe id to peer pipe id mapping (the peer's id for the pipe)
    this.stamp2peer_stamp = {};
    // peer session id to peer pipe id mapping (the current pipe)
    this.ssn2peer_stamp = {};
    // all the listening stream_url servers
    this.servers = {};
    // Router clocks timestamp outgoing handshakes.
    // Data mutation ops are stamped with Host clocks.
    // TODO guarantee non-overlapping timestamps (no practical value, but...)
    if (options.ssn_id) { // user~ssn
        this.ssn_id = options.ssn_id;
        var clock_fn = options.clock || stamp.Clock;
        this.clock = new clock_fn(this.ssn_id);
    }
    if (options.db_id) { // db+cluster
        this.db_id = options.db_id;
    }
    if (options.storage_url) {
        this.setStorage(options.storage_url);
    } else if (options.storage) {
        var store = options.storage, self = this;
        var random = stamp.base64.int2base(Math.floor(Math.random()*10000));
        store.listen('0:'+random, function () {
            self.setStorage('0:'+random);
        });
    }

    /*this.id = id;
    if (!storage) { throw new Error("Router needs Storage"); }
    this.storage = storage;
    // "special" pipes: logics is "0+Router_id", storage is "1+Router_id"
    this.storage.id = '1+' + this.id;
    this._server = /^swarm~.+/.test(id);

    // FIXME upstream handshake
    this.clock = new stamp.Clock(this.id, ms||0); */


    // setInterval(this.maintenance.bind(this));
}
util.inherits(Router, EventEmitter);
module.exports = Router;

// listen --> addStream (stream) --> auth(hs, stream) -> deliver
// addPeer --> addStream...
Router.prototype.listen = function (url, options) {
    if (!this.db_id || !this.ssn_id) {
        throw new Error('no ids - can not handshake');
    }
    var server = stream_url.listen(url, options);
    server.on('connection', this.addStream.bind(this));
    this.servers[url] = server;
};


Router.prototype.connect = function (url, options) {
    var self = this;
    stream_url.connect ( url, options, function (err, stream) {
        if (err) {
            console.error('peer connection failed', err);
        } else {
            self.addStream(stream);
        }
    });
};

// FIXME outdated
Router.prototype.disconnect = function (id, comment) {
    for(var i in this.pipes) {
        var src = this.pipes[i];
        if (!id || src.uri===id || src.id===id) {
            src.deliver(new Op(this.newEventSpec('off'), comment||'', this.id));
            src.close();
        }
    }
};


Router.prototype.handshake = function () {
    if (!this.db_id || !this.ssn_id) {
        return null;
    }
    var hs = new Spec('/Swarm').add(this.db_id, '#')
        .add(this.time(), '!').add('.on');
    return new Op(hs, '');
};


Router.prototype.setStorage = function (url, options) {
    var self = this;
    var hs = self.handshake();
    stream_url.connect(url, options, function(err, stream){
        if (err) {
            console.error('storage connect fails', err);
            return;
        }
        self.storage = new OpStream(stream);
        if (hs) { // we know who we are
            self.storage.sendHandshake(hs);
        }
        self.storage.on('id', init_ids);
    });
    function init_ids (op){
        var store_ssn_id = op.origin();
        var store_db_id = op.id();
        if (self.ssn_id && self.ssn_id!==store_ssn_id) {
            fail('user/session id mismatch');
        } else if (self.db_id && self.db_id!==store_db_id) {
            fail('db/shard id mismatch');
        } else {
            self.db_id = store_db_id;
            self.ssn_id = store_ssn_id;
            var clock_fn = self.options.clock || stamp.Clock;
            self.clock = new clock_fn(self.ssn_id);
            if (!hs) {
                hs = self.handshake();
                self.storage.sendHandshake(hs);
            }
        }
        // we may now listen for peer connections
        if (self.options.listen_url) {
            self.listen(self.options.listen_url);
        }
        self.emit('ready', this);
    }
    function fail () {
        self.storage && self.storage.end();
        self.storage = null;
    }
};


/**
 * Returns an unique Lamport timestamp on every invocation.
 * Swarm employs 30bit integer Unix-like timestamps starting epoch at
 * 1 Jan 2010. Timestamps are encoded as 5-char base64 tokens; in case
 * several events are generated by the same process at the same second
 * then sequence number is added so a timestamp may be more than 5
 * chars. The id of the Router (+user~session) is appended to the ts.
 */
 Router.prototype.time = function () {
     if (!this.clock) { return null; }
    var ts = this.clock.issueTimestamp();
    this._version = ts;
    return ts;
};

Router.prototype.newEventSpec = function (evname) {
    var spec = this.spec().add(this.time(),'!');
    return spec.add(evname,'.');
};

Router.prototype.spec = function () {
    return new Spec('/Router').add(this.id,'#');
};

/********************* op dispatching *********************



 **********************************************************/



/** The primary op routing function */
Router.prototype.deliver = function (op, pipe) {// TODO "synchronized"

    if (op.constructor!==Op) {
        throw new Error('ops only');
    }

    var ti = op.spec.filter('/#');
    var id = op.spec.id();

    Router.debug && console.log((op.source||'unknown')+'>'+this.id, op.toString());

    /*if (op.spec.type() === 'Router') { // handshake from a (remote) Router
        return this.dispatchRouterHandshake(op, pipe);
    } else {*/
        if (id===op.spec.version()) { // state push
            this.store(op);
            return;
        } else if (!op.source) {
            throw new Error('handshake first');
        }
    //}

    var sub = this.subscriptions[ti];
    if (!sub) {
        sub = this.subscriptions[ti] = new Subscription(id, Modes.SEEK_STATE);
        var uplink = this.getUplink(id) || '0';
        this.linkTo(op.spec.filter('/#'), sub, uplink); // even if none
    }

    if (pipe===this.storage) { // own storage
        switch (sub.state()) {
        case Modes.GC: this.dispatchGcStore(op, sub, pipe); break;
        case Modes.SEEK_STATE: this.dispatchSeekStore(op, sub, pipe); break;
        case Modes.CACHE: this.dispatchCacheStore(op, sub, pipe); break;
        case Modes.FORWARD: this.dispatchFwdStore(op, sub, pipe); break;
        }
    } else if (pipe && pipe.peer_pipe_id===sub.uplink) {
        switch (sub.state()) {
        case Modes.GC: this.dispatchGcUl(op, sub, pipe); break;
        case Modes.SEEK_STATE: this.dispatchSeekUl(op, sub, pipe); break;
        case Modes.CACHE: this.dispatchCacheUl(op, sub, pipe); break;
        case Modes.FORWARD: this.dispatchFwdUl(op, sub, pipe); break;
        }
    } else { // for most practical purposes, Logics is "downstream"
        this.acl(op, sub, pipe);
        switch (sub.state()) {
        case Modes.GC: this.dispatchGcDl(op, sub, pipe); break;
        case Modes.SEEK_STATE: this.dispatchSeekDl(op, sub, pipe); break;
        case Modes.CACHE: this.dispatchCacheDl(op, sub, pipe); break;
        case Modes.FORWARD: this.dispatchFwdDl(op, sub, pipe); break;
        }
    }

};

Router.prototype.maintenance = function () {
    // gc
    //if (sub.mode&Modes.GC) {
    //}
    // stale states
};

Router.prototype.acl = function (op, sub, pipe) {
    if (op.op() in Op.handshake_ops) {
        if (pipe &&
            op.stamp()!==pipe.pipe_id &&
            op.stamp()!==pipe.peer_pipe_id)
        {
            throw new Error('misleading source id');
        }
    }
};

var Modes = {
    GC: 0,
    SEEK_STATE: 1,
    CACHE: 2,
    FORWARD: 3,
    STATES: 3,
    DESPERATE: 8,
    PULL_STATE: 16,
    SHARED: 32
};

/** Subscription state object. */
function Subscription (id, mode) {
    // per-object subscription mode flags (see Modes above)
    this.changeMode(~0, mode);
    // the uplink node (also mirror)
    this.uplink = null;
    // it is not yet clear whether we have the state locally
    this.pending = []; // ops
    // queried and patched; joined the spanning tree
    this.links = []; // ppids
}
// Once a handshake is completed (.diff, .reon) a peer Router starts
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
// downlink) to receive a response (a .diff, maybe an empty one).
// Such pending ops are remembered to forward the response back.
// A diff clears pending state, creates linked state (this.links)

Subscription.prototype.changeMode = function (clear, set) {
    var new_mode = (this.mode & ~clear) | set;
    console.log(this.mode,'->',new_mode);
    this.mode = new_mode;
};

Subscription.prototype.state = function () {
    return this.mode & Modes.STATES;
};


Router.prototype.dispatchSeekUl = function (op, sub, pipe) {
    switch (op.op()) {
    case 'on': // OK, the ul has no state then
        sub.pending.push(op);
        this.askSomeone(op, sub);
    break;
    case 'diff':
        this.store(op);
        this.goCache(op, sub);
    break;
    case 'off':
        // ? the uplink defects
    break;
    case 'error':
        this.complain(op);
    break;
    default:
        this.send(op.reply('error','op sent to stateless replica'));
    break;
    }
};

Router.prototype.dispatchSeekDl = function (op, sub, pipe) {
    var mode = sub.mode;
    switch (op.op()) {
    case 'on':
        if ( (op.value && (mode&Modes.PULL_STATE)) || (mode&Modes.DESPERATE) ){
            // pull the state from a dl
            this.send(op.reply('on', ''));
            /*var pipe = this.pipes[op.stamp()];
            if (!pipe) {
                console.warn('unknown pipe');
                return;
            }*/
            // queue a reon so the storage responds with a diff only
            var ti = op.spec.filter('/#');
            var reon = ti.add(pipe.pipe_id,'!').add('.on');
            sub.pending.push(new Op(reon, op.value, op.stamp()));
        } else {
            sub.pending.push(op);
        }
    break;
    case 'diff':
        // security checks (has uplink responded?)
        if (mode&Modes.PULL_STATE) {
            this.store(op);

            /*pipe = this.pipes[op.stamp()]; // FIXME UGLY
            if (pipe) {
                stamp = pipe.pipe_id;
                for(var i=0; i<sub.pending.length; i++) {
                    var o = sub.pending[i];
                    if (o.stamp()===stamp) {
                        o.value = op.spec.filter('!').toString();
                    }
                }  FIXME need to unbundle diff to see state ver
            }*/

        } else {
            console.warn('preemptive diff from a dl', ''+op);
        }
        this.goCache(op, sub);
    break;
    case 'off':
        var pending = sub.pending, stamp = op.stamp();
        for(var i=0; i<pending.length && pending[i].stamp()!==stamp;){i++;}
        if (i<pending.length) {
            pending.splice(i,1);
        } else {
            console.warn('.off for a non-existing .on', ''+op);
        }
    break;
    case 'state':
        if (sub.pending.length) {
            console.warn('reordered state push?');
        } else {
            this.store(op);
        }
    break;
    case 'error':
        this.complain(op);
    break;
    default:
        // this.send(op.reply('error','op sent to a stateless replica'));
        this.store(op);
    break;
    }
};

Router.prototype.dispatchSeekStore = function (op, sub, pipe) {
    switch (op.op()) {
    case 'on':
        // the only .on the storage received at this stage is
        // a simulated uplink .on
        if (op.stamp()===sub.uplink) {
            this.forwardPreon(op, sub);
        } else {
            throw new Error('highly unexpected .on');
        }

        if (op.value) {
            this.goCache(op, sub);
        } else if (sub.uplink==='0') {
            this.askSomeone(op, sub);
        }
    break;
    case 'diff': // OK, the storage has the state
        this.goCache();
    break;
    case 'off':
        this.store(op.reply('error'), 'what?!');
    break;
    case 'error':
        this.complain(op);
    break;
    default:
        this.store(op.reply('error'), 'diff first');
    break;
    }
};

Router.prototype.dispatchCacheUl = function (op, sub, pipe) {
    switch (op.op()) {
    case 'on':
        this.store(op);
    break;
    case 'diff':
        this.store(op);
    break;
    case 'off':
        // ?
    break;
    case 'error':
        this.complain(op);
    break;
    default:
        this.store(op);
    break;
    }
};

Router.prototype.dispatchCacheDl = function (op, sub, pipe) {
    switch (op.op()) {
    case 'on':
        this.store(op);
        // ??? if (op.origin()!==this.id) {
        //    this.send(op.reply('on',''));
        //}
    break;
    case 'diff':
        this.store(op);
    break;
    case 'off':
        var i = sub.links.indexOf(op.stamp());
        i!==-1 && sub.links.splice(i,1);
        this.send(op.reply('off'));
    break;
    case 'state':
        this.send(op.reply('error'), 'state push for a stateful object');
    break;
    case 'error':
        this.complain(op);
    break;
    default:
        this.store(op);
    break;
    }
};

Router.prototype.id2ppid = function (id) {
    if (id in this.pipes) { return id; }
    if (id in this.pid2ppid) { return this.pid2ppid[id]; }
    if (id in this.src2ppid) { return this.src2ppid[id]; }
    return null;
};

Router.prototype.dispatchCacheStore = function (op, sub, pipe) {
    switch (op.op()) {
    case 'on':
        if (op.stamp()===sub.uplink) {
            // on relink we redo preon > uplink on
            this.forwardPreon(op, sub);
        } else {
            this.send(op.relay(op.stamp())); // TODO chain stamps
        }
    break;
    case 'diff':
        // Once the peer replica state is made equal to our state,
        // all the new ops must be relayed to keep it up to date.
        // In other words, that replica joins our subtree.
        var ppid = this.id2ppid(op.stamp());
        if (!ppid && op.stamp()!=='0+'+this.id) { // FIXME
            console.warn('subscription of unclear origin');
            return;
        }

        this.send(op.relay(ppid || '0+'+this.id)); // TODO chain stamps
        if (!sub.links) { sub.links = []; }
        var stamp = op.stamp();
        if (sub.links.indexOf(stamp)===-1) {
            sub.links.push(stamp);
        } else {
            console.warn('repeated subscription', ''+op.id());
        }
    break;
    case 'off':
        this.store(op.reply('error','what?'));
    break;
    case 'error':
        if (op.source in this.pipes) {
            this.send(op.relay(op.source));
        } else { // TODO
            this.complain(op);
        }
    break;
    default:
        // the storage says it is a new op => relay it
        this.fanout(op, sub);
    break;
    }
};

Router.prototype.dispatchFwdUl = function (op, sub, pipe) {
    switch (op.op()) {
    case 'on':
    case 'diff':
    case 'error':
        this.send(op.strip(sub.uplink));
    break;
    case 'off':
        this.fanout(op.reply('off'), sub);
    break;
    default:
        this.fanout(op, sub);
    break;
    }
};

Router.prototype.dispatchFwdDl = function (op, sub, pipe) {
    switch (op.op()) {
    case 'on':
    case 'diff':
    case 'error':
        // push
        this.send(op.relayMarked(sub.uplink, op.source));
    break;
    case 'off':
        // to accomodate the case of several fwd nodes (fwd chain)
        // a fwd node relays .off if the last downlink is out
        var i = sub.links.indexOf(op.source);
        i!==-1 && sub.links.splice(i, 1);
        if (sub.links.length===0) {
            this.goGc(op);
        }
    break;
    default:
        this.send(op.relay(sub.uplink));
    break;
    }
};

Router.prototype.dispatchFwdStore = function (op, sub, pipe) {
    // this still may happen in case the hash ring changes
    this.store(op.reply('error', 'the object is in fwd mode'));
};


Router.prototype.dispatchGcUl = function (op, sub, pipe) {
    switch (op.op()) {
    case 'off':
        // by popular demand, stop sending stuff
        // and prepare to be deleted
        sub.uplink = null;
    break;
    case 'error':
        this.complain(op);
    break;
    default:
        // some leftover ops, just ignore them;
        // downlinks are not listening anymore
        // (may save them for later, but why?)
    break;
    }
};

// Downlinks may unsubscribe, but they keep sending stuff till
// our .off reaches them. Ignore these ops.
Router.prototype.dispatchGcDl = function (op, sub, pipe) {
    if (op.op()==='error') {
        this.complain(op);
    } else {
        this.send(op.reply('error', 'have some rest'));
    }
};

Router.prototype.dispatchGcStore = function (op, sub, pipe) {
    if (op.op()==='error') {
        this.complain(op);
    } else {
        this.send(op.reply('error', 'have some rest'));
    }
};


// we can't delete the subscription immediately as peers
// are likely to send us some ops till they process our .off
Router.prototype.goGc = function (op, sub, pipe) {
    sub.changeMode(Modes.STATES, Modes.GC);
    var off = op.spec.filter('/#').add(sub.uplink).add('.off');
    this.send(new Op(off, '', sub.uplink));
};


Router.prototype.complain = function (op, msg) {
    console.error(msg||'error reported:', op.toString());
};

Router.prototype.fanout = function (op, sub) {
    // This may echo a new op back to its source.
    // In some cases (server2client) we may need that as
    // an acknowledgement. In other cases (Router2logix,
    // client2server) we'd better supress it. FIXME
    for(var i=0; sub.links && i<sub.links.length; i++) {
        var link = sub.links[i];
        if (link===op.source) { // we may skip echo sometimes
            // don't echo to the logix
            if (link==='0+'+this.id) { continue; }
            // TODO don't echo it up
            if (link===sub.uplink) { continue; }
        }
        this.send(op.relay(link));
    }
};


Router.prototype.goCache = function (op, sub, pipe) {
    sub.changeMode(
            Modes.PULL_STATE|Modes.DESPERATE|Modes.STATES,
            Modes.CACHE);
    var self = this;
    if (sub.pending===null) {return;}
    /*var clear = this.pending.filter(function(o){
        return o.stamp() !== stamp;
    });*/
    sub.pending.forEach(function(o){
        self.store(o);
    });
    sub.pending = null;
};


// query statefuls
Router.prototype.askSomeone = function (op, sub) {
    var pending = sub.pending;
    var self = this;
    function reon (on) {
        var pipe = self.pipes[on.stamp()];
        if (!pipe) {
            console.warn('?');
        }
        var pid = pipe.pipe_id;
        var spec = on.spec.filter('/#').add(pid,'!').add('.on');
        return new Op(spec, on.value, on.source);
    }
    for(var p=0; p<pending.length &&  // FIXME treat logix uniformly
        (!pending[p].value || pending[p].source===('0+'+this.id) ||
        pending[p].origin()===this.id); ) {p++;}
    if ( p<pending.length ) {
        // ask the downlink that has the state
        sub.changeMode(Modes.DESPERATE, Modes.PULL_STATE);
        var o = pending[p];
        this.send(o.reply('on', ''));
        pending[p] = reon(o);
    } else { // we give up, ask all downlink(s) for the state
        //this.pending = [];
        sub.changeMode(0, Modes.DESPERATE|Modes.PULL_STATE);
        for(p=0; p<pending.length && !pending[p].value; p++) {
            o = pending[p];
            if (o.source!==('0+'+this.id) && o.origin()!==this.id) {
                this.send(o.reply('on',''));
                pending[p] = reon(o);
            }
        }
    }
    // These state-seeking reons will not discharge incoming
    // pending subscriptions (this.pending). Once we'll get
    // the state we'll send back "real" reons.
    // Multiple reons per pipe are perfectly aceptable; that
    // may lead to multiple .diffs, but only 1 subscription.
    // FIXME  TIMER for desperates!!!
};




// Q if client contacts fwd, what is the bm ?!!
// A 'swarm'
/** diffs are groups of operations related to the same object. Those are
 * sent to achieve pseudo-atomicity (when sending a log tail) or as a
 * performance optimization.
 */
/** A state bootstraps a local object replica. State+log is classics.
  * http://en.wikipedia.org/wiki/State_machine_replication */



/** new Type()  in multiRouter env it may be safer to use Router.get() or,
  * at least, new Type(id, Router) / new Type(somevalue, Router) */
Router.prototype.get = function (spec, callback) {
    return this.logics.get(spec, callback);
};


Router.prototype.send = function send (op) {
    if (op.source==='0+'+this.id) { // local logix
        this.logics.deliver(op);
    } else {
        var peer_id = this.src2ppid[op.source] ||
            this.pid2ppid[op.source] || op.source;
        var pipe = this.pipes[peer_id];
        if (pipe) {
            pipe.deliver(op);
        } else {
            console.warn('op sent to nowhere', ''+op, op.source);
        }
    }
};

Router.prototype.store = function (op) {
    this.storage.deliver(op);
};

// TODO .4 no own storage => .off everyone to re-handshake

Router.prototype.gc = function (spec) {
    /*if (links.length===0 && !(id in this.syncables)) { // gc() ?
        delete this.links[id];
        var uplink = this.uplink[id];
        this.send(uplink,spec.set('.off'));
        delete this.uplink[id];
    }*/
};


/********************* peer connections *********************/



/*Router.prototype.dispatchRouterHandshake = function (op, pipe) {


    TODO MOVE TEXT


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
    switch (op.op()) {
    case 'on':    this.RouterOn(op, pipe);   break;
    case 'off':   this.RouterOff(op, pipe);   break;
    case 'error': this.RouterError(op, pipe); break;
    default:      throw new Error('no such thing allowed');
    }
};*/


/** Handshake operations:
/Router#dbname~cluster!pipeid+user~session.on
/Router#dbname~cluster!pipeid+user~session!peerpipeid+peer~ssn.on TIME

/Router#dbname~cluster!pipeid+user~session.off
/Router#dbname~cluster!pipeid+user~session!peerpipeid+peer~ssn.off
Router.prototype.RouterOn = function (op, pipe) {
    var db_cluster = op.id();
    var is_reon = !!pipe.pipe_id;
    pipe.peer_pipe_id = op.stamp();
    pipe.id = op.origin();
    // send a response
    if (!is_reon) {
        var reon = this.newEventSpec('on');
        pipe.pipe_id = reon.version();
        pipe.deliver(new Op(reon, this.clock.ms()));
    } else if (op.value) { // adjust local clocks
        this.clock.adjustTime(op.value);
    }
    // relink subscriptions, etc
    this.addPipe(op.spec, pipe);
};
*/


Router.prototype.RouterOff = function (op, pipe) {
    if (op.origin()!==this.id) {
        pipe.deliver(op.reply('off'), '', this.id);
    }
    this.removePipe(op.spec, pipe);
};


Router.prototype.RouterError = function (op, pipe) {
    console.error('handshake fails', op.toString());
};

/** A workaround for abnormal close cases (conn broken, etc) */
Router.prototype.onPipeClosed = function (pipe) {
    if (this.pipes[pipe.peer_pipe_id]===pipe) {
        // make up a synthetic .off event
        this.removePipe(this.newEventSpec('off'), pipe);
    }
};


// We have a stream, we received a handshake. From this point on, the
// peer connection is fully functional.
Router.prototype.addStream = function RouterAddPipe(stream) {

    var op_stream = new OpStream(stream), self=this;
    var hs = this.handshake();
    if (!hs) {
        throw new Error('not initialized, can not make connections');
    }
    op_stream.sendHandshake(hs);

    var timeout = setTimeout(function close_stalled_stream () {
        op_stream.end();
    }, 3000);

    op_stream.on('id', function on_incoming_handshake (op, ops) {
        clearTimeout(timeout);

        // TODO auth happens here

        add_peer(op_stream);
    });

    function add_peer (op_stream) {
        // replacement is different from removal, mostly because
        // we don't want to change all subscriptions twice
        var old_peer_stamp = self.ssn2peer_stamp[op_stream.peer_ssn_id];
        var new_peer_stamp = op_stream.peer_stamp;
        if (old_peer_stamp) {
            var old = self.peers[old_peer_stamp];
            old.deliver( new Op(self.spec().add(old.stamp, '!').add('.off')) );
            delete self.ssn2peer_stamp[op_stream.peer_ssn_id];
            delete self.stamp2peer_stamp[old.stamp];
            delete self.peers[old_peer_stamp];
            old.end();
        }

        self.ssn2peer_stamp[op_stream.peer_ssn_id] = new_peer_stamp;
        self.stamp2peer_stamp[op_stream.stamp] = new_peer_stamp;
        self.peers[new_peer_stamp] = op_stream;

        op_stream.on('data', self.deliver.bind(self));

        op_stream.on('error', function (err, stream) {
            console.error('peer stream error', err);
            self.removePeer(stream);
        });
        op_stream.on('end', self.removePeer.bind(self));

        // necessarily, a full scan to detect which ones to (re-)subscribe
        self.relink(undefined);

        self.emit('connect', op_stream);
    }

};


Router.prototype.removePeer = function (opstream) {
};

/*Router.prototype.removePipe = function (spec, pipe) {
    var ppid = pipe.peer_pipe_id;
    var pid = pipe.pipe_id;
    var source = pipe.id;
    if (!this.pipes[ppid]) {
        return; // removed already?
    }

    if (this.src2ppid[source] !== ppid) {
        throw new Error('undead pipe: '+ppid);
    }
    delete this.pipes[ppid];
    delete this.src2ppid[source];
    delete this.pid2ppid[pipe.pipe_id];
    pipe.close();

    this.relink(pipe.peer_pipe_id);
    this.cleanUpLinks(pid); // TODO 1Hz

    this.emit('disconnect', pipe);

};*/


/********************** Spanning tree **********************

    getUplink: peer_pipe_id
    sub.uplink: peer_pipe_id
    preon stamp: peer_pipe_id
    on stamp: pipe_id
    fictive preon (root): 0
    logix on: 0+myself
    send(): peer_pipe_id

 ***********************************************************/


/**
 *
 * Uplink connections may be closed or reestablished so we need
 * to adjust every object's subscriptions time to time.
 */
Router.prototype.linkTo = function (ti, sub, peer_pipe_id) {
    //var ti = op.spec.filter('/#');

    if (sub.uplink===peer_pipe_id) {
        return; // it's OK
    }

    if (sub.uplink) {
        var pipe = this.pipes[sub.uplink];
        if (pipe) {
            var off = ti.add(pipe.pipe_id,'!').add('.off');
            this.send(new Op(off, '', pipe.peer_pipe_id));
        }
        sub.uplink = null;
    }

    if ( peer_pipe_id ) {
        sub.uplink = peer_pipe_id; // prevent repetitions
        this.storePreOn(ti, sub, peer_pipe_id);
    }
};


Router.prototype.forwardPreon = function (op, sub) {
    // time1+uplink -> time2+myself
    if (sub.uplink!==op.stamp()) {
        console.warn('wrong preon uplink');
        return;
    }
    if (sub.uplink==='0') { return; } // fictive
    var pipe = this.pipes[sub.uplink];
    var spec = op.spec.filter('/#').add(pipe.pipe_id, '!').add('.on');
    this.send(new Op(spec, op.value, sub.uplink));
};


Router.prototype.relink = function (peer_pipe_id) {

    for (var ti in this.subscriptions) {
        var sub = this.subscriptions[ti];
        if (peer_pipe_id && sub.uplink!==peer_pipe_id) {continue;}
        sub.uplink = null;
        var uplink = this.getUplink(new Spec(ti).id());
// FIXME all wrong here
        uplink && this.linkTo(new Spec(ti), sub, uplink);
    }

};

Router.prototype.cleanUpLinks = function (removed) {
    var self = this;
return; // FIXME
    for (var ti in this.subscriptions) {
        var sub = this.subscriptions[ti];
        if (sub.links) { // TODO redo inefficient
            var clean = sub.links.filter(function(p){
                return (p==='0') || (p in self.anyid2peerid);
            });
            if (clean.length!==sub.links.length) {
                sub.links = clean;
            }
        }
    }
};

Router.prototype.share = function (ti, peer_id) {
    ti = new Spec(ti).filter('/#');
    // FIXME: cold mode (no sub)
    var sub = this.subscriptions[ti];
    sub.changeMode(0, Modes.SHARED);

    var ppid = this.src2ppid[peer_id];
    var pipe = this.pipes[ppid];
    if (!pipe) {
        console.warn('pipe unknown', ppid);
        return;
    }

    this.storePreOn(ti, sub, ppid);
};

Router.prototype.storePreOn = function (ti, sub, peer_pipe_id) {
    var preon = ti.add(peer_pipe_id,'!').add('.on');
    this.store( new Op(preon, '~', '0') );
    // ask the storage to subscribe to the uplink (if any);
    // the storage may have log bookmarks for that uplink
};

Router.MAX_INT = 9007199254740992;
Router.MAX_SYNC_TIME = 60 * 60000; // 1 hour (milliseconds)
Router.HASH_POINTS = 3;

Router.hashDistance = function hashDistance(pipe, obj) {
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
    for (var i = 0; i < Router.HASH_POINTS; i++) {
        var hash = env.hashfn(pipe.id + ':' + i);
        dist = Math.min(dist, hash ^ obj);
    }
    return dist;
};

 /* This default
 * implementation uses a simple consistent hashing scheme.
 * Note that a client may be connected to many servers
 * (pipes), so the uplink selection logic is shared.
 * Neither the server nor the storage depend on the particular CRDT
 * type logic so syncables are sorted by #id, irrespectively of their /type.
 */
Router.prototype.getUplink = function (id) {
    var mindist = 4294967295,
        reServer = /^swarm~/, // pipes, not clients
        target = env.hashfn(id),
        closestpipe = null;

    if (reServer.test(this.id)) { // just in case we're the root
        mindist = Router.hashDistance(this.id, target);
        closestpipe = null;
    }

    for (var peer_id in this.pipes) {
        var pipe = this.pipes[peer_id];
        var src_id = pipe.id;
        if ( !reServer.test(src_id) ) {
            continue;
        }
        var dist = Router.hashDistance(src_id, target);
        if (dist < mindist) {
            closestpipe = peer_id;
            mindist = dist;
        }
    }
    return closestpipe;
};


/********************* network-related *********************/




Router.prototype.isUplinked = function () {
    for (var id in this.sources) {
        if (/^swarm~.*/.test(id)) {
            return true;
        }
    }
    return false;
};

Router.prototype.isServer = function () {
    return this._server;
};



Router.prototype.close = function (cb) {
    for(var id in this.sources) {
        this.disconnect(id);
    }
    if (this.storage) {
        this.storage.close(cb);
    } else if (cb) {
        cb();
    }
};
