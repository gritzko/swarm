"use strict";

var env = require('./env');
var Spec = require('./Spec');
var Syncable = require('./Syncable');
var Pipe = require('./Pipe');
var SecondPreciseClock = require('./SecondPreciseClock');

/**
 * Host is (normally) a singleton object registering/coordinating
 * all the local Swarm objects, connecting them to appropriate
 * external uplinks, maintaining clocks, etc.
 * Host itself is not fully synchronized like a Model but still
 * does some event gossiping with peer Hosts.
 * @constructor
 */
function Host(id, ms, storage) {
    this.objects = {};
    this.sources = {};
    this.storage = storage;
    this._host = this; // :)
    this._lstn = [','];
    this._id = id;
    this._server = /^swarm~.*/.test(id);
    var clock_fn = env.clockType || SecondPreciseClock;
    this.clock = new clock_fn(this._id, ms||0);

    if (this.storage) {
        this.sources[this._id] = this.storage;
        this.storage._host = this;
    }
    delete this.objects[this.spec()];

    if (!env.multihost) {
        if (env.localhost) {
            throw new Error('use multihost mode');
        }
        env.localhost = this;
    }
}

Host.MAX_INT = 9007199254740992;
Host.MAX_SYNC_TIME = 60 * 60000; // 1 hour (milliseconds)
Host.HASH_POINTS = 3;

Host.hashDistance = function hashDistance(peer, obj) {
    if ((obj).constructor !== Number) {
        if (obj._id) {
            obj = obj._id;
        }
        obj = env.hashfn(obj);
    }
    if (peer._id) {
        peer = peer._id;
    }
    var dist = 4294967295;
    for (var i = 0; i < Host.HASH_POINTS; i++) {
        var hash = env.hashfn(peer._id + ':' + i);
        dist = Math.min(dist, hash ^ obj);
    }
    return dist;
};

module.exports = Syncable.extend(Host, {

    deliver: function (spec, val, repl) {
        if (spec.type() !== 'Host') {
            var typeid = spec.filter('/#');
            var obj = this.get(typeid);
            if (obj) {
                // TODO seeTimestamp()
                obj.deliver(spec, val, repl);
            }
        } else {
            this._super.deliver.apply(this, arguments);
        }
    },

    init: function (spec, val, repl) {

    },

    get: function (spec, callback) {
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
            o = new t(typeid, undefined, this);
            if (typeof(callback) === 'function') {
                o.on('.init', callback);
            }
        }
        return o;
    },

    addSource: function hostAddPeer(spec, peer) {
        //FIXME when their time is off so tell them so
        // if (false) { this.clockOffset; }
        var old = this.sources[peer._id];
        if (old) {
            old.deliver(this.newEventSpec('off'), '', this);
        }

        this.sources[peer._id] = peer;
        if (spec.op() === 'on') {
            peer.deliver(this.newEventSpec('reon'), this.clock.ms(), this);
        }
        for (var sp in this.objects) {
            this.objects[sp].checkUplink();
        }
    },

    neutrals: {
        /**
         * Host forwards on() calls to local objects to support some
         * shortcut notations, like
         *          host.on('/Mouse',callback)
         *          host.on('/Mouse.init',callback)
         *          host.on('/Mouse#Mickey',callback)
         *          host.on('/Mouse#Mickey.init',callback)
         *          host.on('/Mouse#Mickey!baseVersion',repl)
         *          host.on('/Mouse#Mickey!base.x',trackfn)
         * The target object may not exist beforehand.
         * Note that the specifier is actually the second 3sig parameter
         * (value). The 1st (spec) reflects this /Host.on invocation only.
         */
        on: function hostOn(spec, filter, lstn) {
            if (!filter) {
                // the subscriber needs "all the events"
                return this.addSource(spec, lstn);
            }

            if (filter.constructor === Function && filter.id) {
                filter = new Spec(filter.id, '/');
            } else if (filter.constructor === String) {
                filter = new Spec(filter, '.');
            }
            // either suscribe to this Host or to some other object
            if (!filter.has('/') || filter.type() === 'Host') {
                this._super._neutrals.on.call(this, spec, filter, lstn);
            } else {
                var objSpec = new Spec(filter);
                if (!objSpec.has('#')) {
                    throw new Error('no id to listen');
                }
                objSpec = objSpec.set('.on').set(spec.version(), '!');
                this.deliver(objSpec, filter, lstn);
            }
        },

        reon: function hostReOn(spec, ms, host) {
            if (spec.type() !== 'Host') {
                throw new Error('Host.reon(/NotHost.reon)');
            }
            this.clock.adjustTime(ms);
            this.addSource(spec, host);
        },

        off: function (spec, nothing, peer) {
            peer.deliver(peer.spec().add(this.time(), '!').add('.reoff'), '', this);
            this.removeSource(spec, peer);
        },

        reoff: function hostReOff(spec, nothing, peer) {
            this.removeSource(spec, peer);
        }

    }, // neutrals

    removeSource: function (spec, peer) {
        if (spec.type() !== 'Host') {
            throw new Error('Host.removeSource(/NoHost)');
        }

        if (this.sources[peer._id] !== peer) {
            console.error('peer unknown', peer._id); //throw new Error
            return;
        }
        delete this.sources[peer._id];
        for (var sp in this.objects) {
            var obj = this.objects[sp];
            if (obj.getListenerIndex(peer, true) > -1) {
                obj.off(sp, '', peer);
                obj.checkUplink(sp);
            }
        }
    },


    /**
     * Returns an unique Lamport timestamp on every invocation.
     * Swarm employs 30bit integer Unix-like timestamps starting epoch at
     * 1 Jan 2010. Timestamps are encoded as 5-char base64 tokens; in case
     * several events are generated by the same process at the same second
     * then sequence number is added so a timestamp may be more than 5
     * chars. The id of the Host (+user~session) is appended to the ts.
     */
    time: function () {
        var ts = this.clock.issueTimestamp();
        this._version = ts;
        return ts;
    },

    /**
     * Returns an array of sources (caches,storages,uplinks,peers)
     * a given replica should be subscribed to. This default
     * implementation uses a simple consistent hashing scheme.
     * Note that a client may be connected to many servers
     * (peers), so the uplink selection logic is shared.
     * @param {Spec} spec some object specifier
     * @returns {Array} array of currently available uplinks for specified object
     */
    getSources: function (spec) {
        var self = this,
            uplinks = [],
            mindist = 4294967295,
            rePeer = /^swarm~/, // peers, not clients
            target = env.hashfn(spec),
            closestPeer = null;

        if (rePeer.test(this._id)) {
            mindist = Host.hashDistance(this._id, target);
            closestPeer = this.storage;
        } else {
            uplinks.push(self.storage); // client-side cache
        }

        for (var id in this.sources) {
            if (!rePeer.test(id)) {
                continue;
            }
            var dist = Host.hashDistance(id, target);
            if (dist < mindist) {
                closestPeer = this.sources[id];
                mindist = dist;
            }
        }
        if (closestPeer) {
            uplinks.push(closestPeer);
        }
        return uplinks;
    },

    isUplinked: function () {
        for (var id in this.sources) {
            if (/^swarm~.*/.test(id)) {
                return true;
            }
        }
        return false;
    },

    isServer: function () {
        return this._server;
    },

    register: function (obj) {
        var spec = obj.spec();
        if (spec in this.objects) {
            return this.objects[spec];
        }
        this.objects[spec] = obj;
        return obj;
    },

    unregister: function (obj) {
        var spec = obj.spec();
        // TODO unsubscribe from the uplink - swarm-scale gc
        if (spec in this.objects) {
            delete this.objects[spec];
        }
    },

    // waits for handshake from stream
    accept: function (stream_or_url, pipe_env) {
        new Pipe(this, stream_or_url, pipe_env);
    },

    // initiate handshake with peer
    connect: function (stream_or_url, pipe_env) {
        var pipe = new Pipe(this, stream_or_url, pipe_env);
        pipe.deliver(new Spec('/Host#'+this._id+'!0.on'), '', this); //this.newEventSpec
        return pipe;
    },

    disconnect: function (id) {
        for (var peer_id in this.sources) {
            if (id && peer_id != id) {
                continue;
            }
            if (peer_id === this._id) {
                // storage
                continue;
            }
            var peer = this.sources[peer_id];
            // normally, .off is sent by a downlink
            peer.deliver(peer.spec().add(this.time(), '!').add('.off'));
        }
    },

    close: function (cb) {
        for(var id in this.sources) {
            if (id===this._id) {continue;}
            this.disconnect(id);
        }
        if (this.storage) {
            this.storage.close(cb);
        } else if (cb) {
            cb();
        }
    },

    checkUplink: function (spec) {
        //  TBD Host event relay + PEX
    }

});
