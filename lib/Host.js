"use strict";

var env = require('./env');
var Spec = require('./Spec');
var Syncable = require('./Syncable');
//var Pipe = require('./Pipe');
var SecondPreciseClock = require('./SecondPreciseClock');

/** Swarm has three orthogonal parts: Logics, Host and Storage.
 * Storage is a key-value db for operation logs (op logs).
 * Logics is a world of syncable CRDT objects that consume ops.
 * Host deals with object subscriptions and op forwarding.
 *
 * A Host can be seen as a (partial) replica of a model.
 * Practically, that is a client (browser/mobile) or a server process.
 * Differently from other classes of systems, Swarm deals with
 * per-object subscriptions so a developer may use an arbitrary
 * collection of "live" replicated objects (syncables) on the
 * client side. The resulting (asynchronous!) message exchange
 * patterns are quite complicated, starting from per-object
 * subscriptions, operation forwarding, secondary clients etc.
 * Host focuses exactly on that part of the problem, so the Storage
 * may stay key-value dumb and Logics may be mathematically pure.
 * Host maintains local clocks and, generally, glues it all together.
 */
function Host(id, ms, storage) {
    this.objects = {};
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

    // on/off state machine related collections
    // Host does not care about the type, so collections are keyed by #ids
    this.downlinks = {};
    this.pending_ons = {};
    this.uplink = {};
    this.pending_uplink = {};

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

    env.logs.op && console.log(
        (env.multihost?'@'+this.id:''),
        spec.toString(), value, source&&source.id?'('+source.id+')':'');

    if (spec.type() === 'Host') {
        switch (spec.op()) {
            case 'on':    this.onHandshake (spec, value, source); break;
            case 'reon':  this.onHandshakeResponse (spec, value, source); break;
            case 'off':   this.onGoodbye (spec, value, source); break;
            case 'reoff': this.onGoodbyeResponse (spec, value, source); break;
            case 'error': this.onError (spec, value, source); break;
            default:      throw new Error("!!!");
        }
        return;
    }

    if (source && source.constructor===Pipe && !source.id) { // ...
        throw new Error('handshake first');
    }

    // finally, neatly consolidated on/reon/off/reon code
    switch (spec.op()) {
        case 'on':    this.onSubscription(spec,value,source); break;
        case 'off':   this.onUnsubscription(spec,value,source); break;
        case 'reon':  this.onReciprocalSubscription(spec,value,source); break;
        case 'reoff': this.onReciprocalUnsubscription(spec,value,source); break;
        case 'bundle':this.onBundle(spec,value,source); break;
        case 'state': this.onState(spec,value,source); break;
        default:      this.onOp(spec,value,source); break;
    }

};

/** A regular operation that will somehow modify the state.
  * The logics knows better. */
Host.prototype.onOp = function (spec, value, source) {
    var id = spec.id();
    var o = this.get(spec);
    if (!o._version) {
        throw new Error("can't apply an op to a stateless object #" + id);
    }
    source!==null && o.deliver(spec, value, source);
    var dls = this.downlinks[id];
    if (dls) {
        for(var dl=0; dl<dls.length; dl++) {
            var dl_src = this.sources[dls[dl]]; // heh
            if (dl_src) {
                if (dl_src!==source) {
                    dl_src.deliver(spec, value, this);
                }
            } else {
                dls[dl] = null;
            }
        }
    }
};

/** Incoming subscription, essentially a read request for an object.
  * Read for them is write for us (READ=WRITE^-1).
  * Normally, an `.on` is received from  a downlink (client), sometimes
  * from a pipe connection. `.on` is reciprocated with `.reon` in case
  * the source has write rights (i.e. may author ops). */
Host.prototype.onSubscription = function (spec, base, source) {
    var id = spec.id();
    var typeid = spec.filter('/#');
    var o = this.get(typeid); // get -> constructor -> register -> uplink.on
    if (o._version) {
        if (base) {
            var diff = o.diff(new Spec(base).filter('!'));
            diff && source.deliver(spec.set('.bundle'), diff, this);
        } else {
            source.deliver(spec.set('.state'), o.toPojo(true), this);
        }
        if (id in this.uplink) { // me part of the tree
            source.deliver(spec.set('.reon'), o.version().toString(), this);
        }
        var dls = this.downlinks[id];
        if (!dls) { dls = this.downlinks[id] = []; }
        if (dls.indexOf(source.id)===-1) {
            dls.push(source.id);
        }
    } else { // delay response till we have a state
        if (!(id in this.pending_ons)) { this.pending_ons[id] = []; }
        this.pending_ons[id].push({
            source: source.id,
            value: base,
            spec: spec.toString()
        });
    }
};

/** An incoming unsubscription from someone who has subscribed previously. */
Host.prototype.onUnsubscription = function (spec, value, source) {
    var id = spec.id();
    if (id in this.pending_ons) {
        this.pending_ons[id] =
            this.pending_ons[id].filter( function (on) {
                return on.source!==source.id;
            });
        if (!this.pending_ons[id].length) {
            delete this.pending_ons[id];
        }
    }
    var dls = this.downlinks[id];
    if (dls) {
        var i = dls.indexOf(source.id);
        i!==-1 && dls.splice(i,1);
        if (!dls.length) { delete this.downlinks[id]; }
    }
};

Host.prototype.onReciprocalSubscription = function (spec, value, source) {
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
};

/** Now, the other side does not listen either. May also be triggered by a
  * revocation of write rights. (TODO) */
Host.prototype.onReciprocalUnsubscription = function (spec, value, source) {
    var id = spec.id();
    if (this.uplink[id]===source.id) {
        delete this.uplink[id];
        // may reoff downlinks as well
    } else {
        0; // we have relinked this object already
    }
};

/** Bundles are groups of operations related to the same object. Those are
 * sent to achieve pseudo-atomicity (when sending a log tail) or as a
 * performance optimization. */
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
};

/** A state bootstraps our local object replica. State+log is classics.
  * http://en.wikipedia.org/wiki/State_machine_replication */
Host.prototype.onState = function (spec, value, source) {
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
    var ons = this.pending_ons[id];
    if (ons) { // unfreeze subscriptions
        var self = this;
        ons.forEach( function(pon) {
            var src = self.sources[pon.source];
            src && self.deliver(new Spec(pon.spec), pon.value, src);
        } );
        delete this.pending_ons[id];
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
    var o = typeid.has('#') && this.objects[typeid];
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
Host.prototype.linkUp = function (spec) {
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

Host.prototype.register = function (spec, obj) {
    var ev_spec = obj.spec().add(spec.version()||this.time(),'!');
    var id = spec.id();
    if (id in this.objects) {
        return this.objects[id];
    }
    this.objects[id] = obj;
    if (obj._id===obj._version.substr(1)) { // state push
        var uplink = this.getUplink(id);
        this.send(
            uplink,
            spec.add('.state'),
            obj.toPojo(true)
        );
    }
    this.linkUp(ev_spec);
    if (this.storage) {
        this.storage.deliver(ev_spec.add('.on'), obj.version().toString(), this);
    }
    return obj;
};

Host.prototype.unregister = function (obj) {
    var typeid_spec = obj.spec();
    var id = obj._id;
    if (id in this.objects) {
        delete this.objects[id];
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
    for (var id in this.objects) {
        this.linkUp(this.objects[id].spec());
    }

    this.emit4({
        name: 'connect',
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
        var o = this.objects[relink.pop()];
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
 * type logic so objects are sorted by #id, irrespectively of their /type.
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
    var server = new env.servers[proto](url, options);
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
    this.pending = {};
    this.id = null;
    this.closed = false;
    this.uri = options.uri;
    this.host = host;
    this.stream = stream;
    this.bound_flush = this.flush.bind(this);
    this.lastSendTime = 0;
    this.serializer = options.serializer || JsonSerializer;
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
    this.pending[spec.toString()] = value;
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
    this.pending = {};
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
    env.logs.net && console.log(this.id||'unknown','>',this.host.id, data.toString());
    var messages = this.serializer.parse(data);
    var author = this.options.restrictAuthor;
    var specs = [], spec;
    for(var s in messages) {
        if (author && spec.author()!==author) {
            spec = new Spec(s);
            this.deliver(this.host.newEventSpec('error'), "access violation");
            this.close();
        }
        // FIXME bundles
        specs.push(s);
    }
    specs.sort().reverse();
    try {
        while (specs.length) {
            spec = new Spec(specs.pop());
            this.host.deliver(spec, messages[spec], this);
        }
    } catch (ex) {
        var err_spec = spec.set('.error');
        this.deliver(err_spec, ex.message);
        console.error('error processing '+spec, ex.message, ex.stack);
        this.close();
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


var JsonSerializer = {
    parse: function (data) {
        return JSON.parse(data.toString());
    },
    serialize: function (data) {
        return JSON.stringify(data);
    }
};
