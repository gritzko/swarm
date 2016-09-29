'use strict';
let swarm = require('swarm-protocol');
let Base64x64 = swarm.Base64x64;
let Stamp = swarm.Stamp;
let Spec = swarm.Spec;
let Op = swarm.Op;
let SwarmMeta = require('./Swarm');
let OpStream = require('./OpStream');
let Syncable = require('./Syncable');

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
     * @param {Spec} spec - typeid spec for the database, e.g. `/Swarm#test` or
     *      `test` or `` for the default database
     * @param {Object} options - local defaults and overrides for the metadata object
     */
    constructor (spec, options) {
        super();         // TODO snapshots (Swarm 1.4)
        /** syncables, API objects, the outer state */
        this._syncables = Object.create(null);
        /** we can only init the clock once we have a meta object */
        this._clock = null;

        this._last_acked = Stamp.ZERO;

        this._op_cb = this.onSyncableOp.bind(this);

        if (!Syncable.multiClient && !Syncable.defaultClient) {
            Syncable.defaultClient = this;
        }

        /** database meta object */
        spec = new Spec(spec);
        this._meta = new SwarmMeta(spec, null, options); // FIXME defaults
        // tip the avalanche
        this._meta.onceReady( on => {
            this._clock = new swarm.Clock(on.scope, this._meta.filterByPrefix('Clock'));
        });
        this.addSyncable(this._meta, spec.Id);
    }

    /** Inject an op. */
    offer(op) {
        let obj = this._syncables[op.typeid];
        if (op.origin === this._id) {
            this._last_acked = op.spec.Stamp;
        } else if (!obj) { // not intereted
            if (op.name !== "off")
                this.emit(new Op(op.spec.rename('off'), ''));
        } else {
            obj.offer(op);
        }
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
     * Open a syncable and attach it to this replica. The state is queried from
     * the upstream. Till the state is received, the object is stateless.
     * @param {Spec} spec - the object's /type#id
     */
    addSyncable (spec) {
        let fn = Syncable._classes[spec.type];
        if (!fn)
            throw new Error('unknown syncable type '+spec.type);
        let obj = new fn(null);
        obj.on(this._op_cb);
        obj._clock = this._clock;
        obj._id = spec.id;
        this._syncables[obj.typeid] = obj;
        this._emit(obj.toOnOff(true));
        return obj;
    }

    /**
     * Create a syncable and attach it to this replica. Tthe existing object's
     * state it taken as the initial state, timestamped and broadcast. The
     * object gets an id (the stamp of that very op).
     * @param {Syncable} obj - the syncable object
     */
    addNewSyncable (obj) {
        obj.on(this._op_cb);
        obj._clock = this._clock;
        obj._submit();
        this._emit(obj.toOnOff(true));
        this._syncables[obj.typeid] = obj;
    }

    removeSyncable (obj) {
        let prev = this._syncables[obj.typeid];
        if (prev!==obj) {
            return;
        }
        delete this._syncables[obj.typeid];
        obj._clock = null;
        this._emit(obj.toOnOff(false));
    }

    onSyncableOp (op, obj) {
        if (op===null) {
            this.removeSyncable(obj);
        } else if (this._clock && op.origin===this._clock.origin) {
            this._emit(op);
        }
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
        return this._clock ? this._clock.issueTimestamp() : null;
    }

    // mark-and-sweep kind-of distributed garbage collection
    gc () {
        // NOTE objects in this.pending can NOT be gc'd
    }

    /** Get a Syncable object for of the given type, with the given id. */
    get (type, id) {
        return this.getBySpec(new Spec([type, id, Stamp.ZERO, Stamp.ZERO]));
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

    create (type) {
        if (type.constructor!==Stamp)
            type = new Stamp(type);
        let typefn = Syncable._classes[type.value];
        if (!typefn) throw new Error('unknown type '+type.value);
        return new typefn(null, this);
    }

    static get (type, id) {
        return Syncable.defaultClient.get(type, id);
    }

    static getBySpec (spec) {
        return Syncable.defaultClient.getBySpec(spec);
    }

    static create (type) {
        return Syncable.defaultClient.create(type);
    }

}

module.exports = Client;