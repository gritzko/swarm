'use strict';
let swarm = require('swarm-protocol');
let Base64x64 = swarm.Base64x64;
let Stamp = swarm.Stamp;
let Spec = swarm.Spec;
let Op = swarm.Op;
let SwarmMeta = require('./SwarmMeta');
let OpStream = require('./OpStream');
let Syncable = require('./Syncable');

/**
 * Host is the world of actual replicated/synchronized objects of various types.
 * Host contains inner CRDT objects and their outer API parts (Syncables).
 * A host is (a) passive and (b) synchronous.
 * Host has an OpStream interface, consuming and emitting ops.
 * To keep a host synchronized, it has to be connected to some
 * transport/storage, e.g. see `swarm-replica`. As a Host has no own storage,
 * it does not persist any information between runs. Hence, it dies once
 * disconnected from its upstream (Replica).
 *
 * Once a Host gets a replica id (hence, its own clock), it can create objects
 * and ops. Objects retrieved by their id remain stateless till some state
 * arrives from the upstream.
 * @class
 * @implements OpStream
 */
class Host extends OpStream {

    /**
     * Create a Host given an upstream and a database id.
     * Replica id is granted by the upstream.
     *
     * @param {Spec} spec - typeid spec for the database, e.g. `/Swarm#test` or
     *      `test` or `` for the default database
     * @param {OpStream} upstream - home peer stream, implements the client
     *    protocol. It can be directly a Replica, a transport stream (TCP,
     *    WebSocket) or a cache stream (WebStorage, IndexedDB, LevelDB, etc).
     * @param {Object} options - local defaults and overrides for the metadata object
     */
    constructor (spec, upstream, options) {
        super();         // TODO snapshots (Swarm 1.4)
        /** syncables, API objects, the outer state */
        this._syncables = Object.create(null);
        /** we can only init the clock once we have a meta object */
        this._clock = null;

        this._upstream = upstream;

        upstream.on(op => {
            let obj = this._syncables[op.typeid];
            if (!obj) {
                if (op.name!=="off")
                    upstream.offer(new Op(op.spec.rename('off'), ''));
            } else if (op.origin===this._id) {
            } else {
                obj.offer(op);
            }
        });

        if (!Syncable.multiHost && !Syncable.defaultHost) {
            Syncable.defaultHost = this;
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

    close () {
        // let's be explicit
        Object.values(this._syncables).forEach(s => this.removeSyncable(s));
        this._upstream.offer(new Op(this.typeid.rename('off'), ''));
        this._upstream.off();
        if (Syncable.defaultHost===this) {
            Syncable.defaultHost = null;
        }
    }

    get typeid () {
        return this._meta.TypeId;
    }


    /** @returns {OpStream} */
    get upstream () {
        return this._upstream;
    }


    /** Submit a new op, invoked by syncables. */
    _submit (op_name, op_value, syncable) {
        var op_id = op_name.constructor===Base64x64 ?
            op_name : new Base64x64(op_name);
        var spec = new Spec([
            syncable.type,
            syncable._id,
            this._clock.issueTimestamp(),
            op_id
        ]);
        var op = new Op(spec, op_value.toString());
        syncable.offer(op);
        this._upstream.offer(op);
    }


    /**
     * Attach a syncable to this replica.
     * In case the object is newly created (like `new LWWObject()`), Host
     * assigns it an id and saves it. For a known-id objects
     * (like `new LWWObject('2THjz01+gritzko~cA4')`) the state is queried
     * from the storage, then from the upstream. Till the state is received,
     * the object is stateless
     * @param {Syncable} obj - the syncable object
     * @param {Stamp} id - the object's #id
     * @param {String} state - the new object's serialized state (id===Stamp.ZERO)
     */
    addSyncable (obj, id, state) {
        let up = this._upstream;
        if (id.isZero()) {
            id = this.time();
            let spec = new Spec([obj.type, id, id, Op.STATE]);
            let init_op = new Op(spec, state||'');
            obj.offer(init_op);
            up.offer(init_op);
        } else {
            obj._id = id;
            let prev = this._syncables[obj.typeid];
            if (prev)
                return prev;
        }
        this._syncables[obj.typeid] = obj;
        obj._id = id;
        obj._host = this;
        up.offer(obj.subscription);
    }

    removeSyncable (obj) {
        let prev = this._syncables[obj.typeid];
        if (prev!==obj) {
            return;
        }
        delete this._syncables[obj.typeid];
        obj._host = null;
        this._upstream.offer(new Op(obj.spec.rename('off'), ''));
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
        return this._syncables[spec.typeid];
    }

    create (type) {
        if (type.constructor!==Stamp)
            type = new Stamp(type);
        let typefn = Syncable._classes[type.value];
        if (!typefn) throw new Error('unknown type '+type.value);
        return new typefn(null, this);
    }

    static get (type, id) {
        return Syncable.defaultHost.get(type, id);
    }

    static getBySpec (spec) {
        return Syncable.defaultHost.getBySpec(spec);
    }

    static create (type) {
        return Syncable.defaultHost.create(type);
    }

}

module.exports = Host;