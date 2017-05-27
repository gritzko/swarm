'use strict';
const swarm = require('swarm-protocol');
const Stamp = swarm.Stamp;
const Spec = swarm.Spec;
const Op = swarm.Op;
const SwarmMeta = require('./Swarm');
const OpStream = require('./OpStream');
const Syncable = require('./Syncable');
const LWWObject = require('./LWWObject');
const URL = require('./URL');

/**
 * Client is the world of actual replicated/synchronized objects of various types.
 * Client contains inner CRDT objects and their outer API parts (Syncables).
 * A host is (a) passive and (b) synchronous.
 * Client has an OpStream interface, consuming and emitting ops.
 * To keep a host synchronized, it has to be connected to some
 * transport/storage, e.g. see `swarm-replica`. As a Client has no own storage,
 * it does not persist any information between runs. Hence, it dies once
 * disconnected from its upstream (Replica).
 *
 * Once a Client gets a replica id (hence, its own clock), it can create objects
 * and ops. Objects retrieved by their id remain stateless till some state
 * arrives from the upstream.
 * @class
 */
class Client extends OpStream {

    /**
     * Create a Client given an upstream and a database id.
     * Replica id is granted by the upstream.
     *
     * @param {String} url -
     * @param {Object} options - local defaults and overrides for the metadata object
     */
    constructor (url, options, callback) {
        super(options);
        if (options && options.constructor===Function) {
            callback = options;
            options = {};
        }
        this.options = options || Object.create(null);
        this._url = new URL(url);
        this._id = new Stamp (this._url.basename); //:(
        /** syncables, API objects, the outer state */
        this._syncables = Object.create(null);
        /** we can only init the clock once we have a meta object */
        this._clock = null;
        this._ssn_stamp = this._last_stamp = this._acked_stamp = Stamp.ZERO;
        this._unsynced = new Map();
        this._upstream = this.options.upstream;
        if (!this._upstream) {
            let next = this._url.clone();
            next.scheme.shift();
            if (!next.scheme.length)
                throw new Error('upstream not specified');
            this._upstream = OpStream.connect(next, options);
        }
        this._upstream.on(this);
        this._meta = this.get(
            SwarmMeta.RDT.Class,
            this.dbid,
            (err, meta, state) => {
                if (err) {
                    callback && callback(err);
                    return;
                }
                this._clock = new swarm.Clock(state.scope, this._meta.filterByPrefix('Clock'));
                this._id = new Stamp(state.birth, state.scope);
                this._clock.seeTimestamp(state.Stamp);
                callback && callback();
            }
        );
        if (!Syncable.defaultHost) // TODO deprecate
            Syncable.defaultHost = this;
    }

    get replicaId () {
        return this._id.origin;
    }

    get dbid () {
        return this._id.value;
    }

    get origin () {
        return this._clock && this._clock.origin;
    }

    onceReady (callback) {
        this._meta.onceStateful(callback);
    }

    _apply (op) { // FIXME chaotic; restructure
        if (this._debug)
            console.warn(this._debug+'{\t'+op);
        const syncable = this._syncables[op.object];
        if (!syncable) return;
        const rdt = syncable._rdt;

        if (!op.Stamp.isAbnormal() && this._clock)
            this._clock.seeTimestamp(op.Stamp);

        if (this._ssn_stamp.isZero() && this._clock && op.isOn()) { //FIXME
            this._ssn_stamp = this._acked_stamp = this.time();
            if (this._last_stamp.isZero())
                this._last_stamp = this._ssn_stamp;
        }

        if (op.isOnOff())
            this._unsynced.delete(op.object); // FIXME to RDT

        if (!op.isOnOff() && op.origin===this.origin && op.Stamp.gt(this._ssn_stamp)) {  // :(
            this._acked_stamp = op.Stamp;
        } else {
            if (!rdt && op.name !== "off")
                this.offer(new Op(op.renamed('off', this.replicaId), ''), this);
            else
                rdt._apply(op);
            this._emit(op);
        }
    }

    offer (op, source) {
        if (this._debug)
            console.warn('}'+this._debug+'>\t'+op);
        this._upstream.offer(op, this);
    }

    close () {
        // let's be explicit
        Object.keys(this._syncables).forEach(typeid => this.removeSyncable(this._syncables[typeid]));
        this._emit(new Op(this.typeid.rename('off'), ''));
        this._emit(null);
        if (Syncable.defaultClient===this) {
            Syncable.defaultClient = null;
        }
    }

    get typeid () {
        return this._meta.TypeId;
    }


    /**
     * Attach a syncable to this replica. The state is queried from
     * the upstream. Till the state is received, the object is stateless.
     * @param {Syncable} obj - the object
     */
    //---

    createOp (opname, opvalue, syncable) {
        const stamp = this.time();
        const spec = new Spec([ syncable.Type, syncable.Id, stamp, opname ]);
        const op = new Op(spec, opvalue);
        syncable.apply(op);
        this._emit(op);
    }

    /**
     * Create a syncable and attach it to this replica. Tthe existing object's
     * state it taken as the initial state, timestamped and broadcast. The
     * object gets an id (the stamp of that very op).
     * @param {Stamp|String|Base64x64} type - the syncable object type
     * @param feed_state - the initial state
     */
    create (type, feed_state, static_id) {
        const fn = Syncable.getClass(type);
        if (!fn)
            throw new Error('unknown syncable type '+type);
        const stamp = this.time();
        const spec = new Spec([
            fn.RDT.Class,
            static_id ? new Stamp(static_id) : stamp,
            stamp,
            Op.STAMP_STATE
        ]);
        const state = feed_state===undefined ? '' :
            fn._init_state(feed_state, stamp, this._clock);
        const op = new Op( spec, state );
        this.offer(op, this);
        const rdt = new fn.RDT(op, this);
        this.offer(rdt.toOnOff(true).scoped(this._id.origin), this);
        return this._syncables[spec.object] = new fn(rdt);
    }

    /** Fetch an object by its id
     *  @param {Spec} spec */
    fetch (spec, on_state) {
        const have = this._syncables[spec.object];
        if (have) {
            on_state && setImmediate(on_state); // force async
            return have;
        }
        const state0 = new Op( [spec.Type, spec.Id, Stamp.ZERO, Op.STAMP_STATE], '' );
        const fn = Syncable.getClass(spec.Type);
        if (!fn)
            throw new Error('unknown syncable type '+spec);
        const rdt = new fn.RDT(state0, this);
        let on = rdt.toOnOff(true).scoped(this._id.origin); // FIXME scope
        if (on.isHandshake())
            on = this._populate_handshake(on);
        const syncable = new fn(rdt, on_state);
        this._syncables[spec.object] = syncable;
        this._unsynced.set(spec.object, 1);
        this.offer(on, this);
        return syncable;
    }

    _populate_handshake (on) {
        if (this._url.replica)
            on = on.scoped(this._url.replica);
        if (this._url.password)
            on._value = JSON.stringify({Password: this._url.password});
        return on;
    }

    _remove_syncable (obj) {
        let prev = this._syncables[obj.typeid];
        if (prev!==obj) {
            return;
        }
        delete this._syncables[obj.typeid];
        obj._clock = null;
        this._emit(obj.toOnOff(false));
    }

    get id () {
        return this._clock.origin;
    }

    get databaseId () {
        return this._spec.id;
    }

    get spec () {
        return this._spec;
    }

    // Returns a new unique timestamp from the host's clock.
    time () {
        if (!this._clock) return null;
        return this._last_stamp = this._clock.issueTimestamp();
    }

    /** @return {Swarm} */
    get meta () {
        return this._meta;
    }

    // mark-and-sweep kind-of distributed garbage collection
    gc () {
        // NOTE objects in this.pending can NOT be gc'd
    }

    /** Get a Syncable object for of the given type, with the given id. */
    get (type, id, callback) {
        if (id===undefined) {
            id = type;
            type = LWWObject.Type;
        }
        if (type.constructor === Function)
            type = type.RDT.Class;
        return this.fetch(new Spec([type, id, Stamp.ZERO, Stamp.ZERO]), callback);
    }

    /** Retrieve a Syncable object for a given specifier.
     * @param {Spec} spec - type and id of the object, optionally: version
     * @returns {Syncable} the object, probably stateless */
    getBySpec (spec) {
        if (spec.constructor!==Spec)
            spec = new Spec(spec);
        let have = this._syncables[spec.typeid];
        if (!have) {
            have = this.addSyncable(spec);
        }
        return have;
    }

    onSync (callback) {
        if (this._unsynced.size===0)
            return callback(null);
        this.on(op => { // TODO .on .off
            if (this._unsynced.size === 0) {
                callback(null, op);
                return OpStream.ENOUGH;
            } else {
                return OpStream.OK;
            }
        });
    }

    static get (type, id) {
        return Syncable.defaultClient.get(type, id);
    }

    static fetch (spec) {
        return Syncable.defaultClient.fetch(spec);
    }

    static create (type, state) {
        return Syncable.defaultClient.create(type, state);
    }

    newLWWObject (init_obj) {
        return this.create(LWWObject.RDT.Class, init_obj);
    }

}

module.exports = Client;
