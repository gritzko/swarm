"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const LevelOp = require ('./LevelOp');
const Swarm = sync.Swarm;
const Clock = swarm.Clock;
const Spec = swarm.Spec;
const Stamp = swarm.Stamp;
const ReplicaIdScheme = swarm.ReplicaIdScheme;

/** An op databasse that has a meta-object and a clock.
 *  (subclasses LevelOp that subclasses LevelDOWN). */
class SwarmDB extends LevelOp {

    /**
     * @param {Stamp} db_replica_id
     * @param {LevelDOWN} leveldown
     * @param {Object} options
     * @param {Function} callback
     *
     * */
    constructor (db_replica_id, leveldown, options, callback) {
        super(leveldown, options, err => err ? callback(err) : this._read_meta(callback));
        this._full_id = db_replica_id;
        this._clock = null;
        this._meta = null;
        this._scheme = null;
    }

    _read_meta (done) {
        this._meta = new Swarm();
        const from = new Spec([Swarm.id, this._full_id.value, Stamp.ZERO, Stamp.ZERO]);
        this.scan(
            from,
            null,
            state => this._meta.offer(state),
            err => {
                if (err) return done(err);
                this.level.get('+'+this._full_id.origin, {asBuffer:false},
                    (err, max) => this._create_clock(err, max, done));
            },
            {
                reverse: true,
                limit: 1,
                filter: o => o.spec.method===swarm.Op.METHOD_STATE
            }
        );
    }

    read_vv (callback) {
        const vv = new swarm.VV();
        let i = this.level.iterator({
            gte: '+0',
            lte: '+~~~~~~~~~~',
            keyAsBuffer: false,
            valueAsBuffer: false
        });
        const next = (err, key, value) => {
            if (err)
                return callback(err, null);
            if (!key)
                return callback(null, vv);
            vv.addPair(value, key.substr(1));
            i.next(next);
        };
        i.next(next);
    }

    _create_clock (err, max, done) {
        if (err) return done(err);
        let meta = this._meta;
        meta.spill(); //FIXME
        meta.on(this._on_meta_op.bind(this));
        // create clock
        this._clock = new Clock(this._full_id.origin, meta.filterByPrefix('Clock'));
        meta._clock = this._clock;
        this._clock.seeTimestamp(max);
        this._scheme = new ReplicaIdScheme(meta.get(ReplicaIdScheme.DB_OPTION_NAME));
        done ();
    }

    putAll (ops, callback) {
        //if (op.isSameObject(this._meta._spec))
        //    this._meta.offer(op);
        let batch = ops.map(op => new LevelOp.Put(op));
        ops.forEach(op=>batch.push(new SwarmDB.VVAdd(op)));
        this._db.batch(batch, {sync: true}, callback);
    }

    _on_meta_op (op) {
        if (op.spec.origin==this._clock.origin)
            super.put(op);
    }

    get id () {return this._meta.id;}
    get Id () {
        if (this._Id===null)
            this._Id = new swarm.ReplicaId(this.id, this.scheme);
        return this._Id;
    }
    get meta () {return this._meta;}
    get clock () {return this._clock;}
    get scheme () {return this._scheme;}

    now () {return this._clock.issueTimestamp();}

}

SwarmDB.VVAdd = class {
    constructor (op) {
        this.type = 'put';
        this.key = '+' + op.spec.Stamp.origin;
        this.value = op.spec.Stamp.value;
    }
};

module.exports = SwarmDB;