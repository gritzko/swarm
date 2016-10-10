"use strict";
const swarm = require('swarm-protocol');
const Spec = swarm.Spec;

/** just a nice thin wrapper for LevelDOWN API */
class LevelOp {

    constructor (db, options, callback) {
        if (options && options.constructor===Function) {
            callback = options;
            options = null;
        }
        options = options || Object.create(null);
        this._db = db;
        db.open(options, callback);
    }

    /** Scan a db in the given object's range, starting after the stamp,
     *  e.g.  db.scan( '/Swarm#test!~', op => ops.push(op), err => ... )
     *  @param {Spec} from - scan the [from,till) range
     *  @param {Spec} till - if null, scan the object's range
     *  @param {Function} on_op - a callback for every op found
     *  @param {Function} on_end - a final callback
     *  @param {Object} options (skipOp, reverse)
     *  @returns {Iterator}
     */
    scan ( from, till, on_op, on_end, options ) {
        options = options || Object.create(null);
        const skip_op = !!options.skipOp;
        const filter = options.filter || null;
        let limit = options.limit || (1<<30);
        if (till===null) {
            till = from.restamped(swarm.Stamp.ERROR);
        }
        let i = this._db.iterator({
            gte: from.toString(),
            lt: till.toString(),
            keyAsBuffer: false,
            valueAsBuffer: false,
            reverse: !!options.reverse,
            limit: (!filter && options.limit) || -1
        });
        let levelop_read_op = (err, key, value) => {
            let ret;
            if (key && !err) {
                let op = skip_op ? null : new swarm.Op(key, value);
                if (filter===null || filter(op)) {
                    ret = on_op(op, key, value);
                    if (!--limit)
                        ret = LevelOp.ENOUGH;
                }
            }
            if ( !key || err || ret===LevelOp.ENOUGH ) {
                i.end(()=>{});
                on_end(err);
            } else {
                i.next(levelop_read_op);
            }
        };
        i.next(levelop_read_op);
        return i;
    }

    /** @param {Array} ops - an array of Op to save
     *  @param {Function} callback  */
    putAll (ops, callback) {
        let batch = ops.map(op => new LevelOp.Put(op));
        this._db.batch(batch, {sync: true}, callback);
    }

    put (op, callback) {
        this.putAll([op], callback);
    }

    replace (delop, addop, callback) {
        let batch = [new LevelOp.Del(delop.spec), new LevelOp.Put(addop)];
        this._db.batch(batch, {sync: true}, callback);
    }

    /** @param {Spec} spec - the key */
    get (spec, callback) {
        this._db.get(spec.toString(), {asBuffer:false},
            (err, value) => callback && callback(err?null:new swarm.Op(spec, value)) );
    }

    del (spec, callback) {
        this._db.del(spec.toString(), {sync: true}, err=>callback&&callback(err));
    }

    delAll (specs, callback) {
        let dels = specs.map(spec => new LevelOp.Del(spec));
        this._db.batch(dels, {sync: true}, (err) => callback && callback(err));
    }

    close (callback) {
        this._db.close(callback);
    }

    get level () {return this._db;}

}

LevelOp.ENOUGH = Symbol('Enough!');

LevelOp.Put = class LevelOpPut {
    constructor(op) {
        this.type = 'put';
        this.key = op.spec.toString();
        this.value = op.value;
    }
};

LevelOp.Del = class LevelOpDel {
    constructor(spec) {
        this.type = 'del';
        this.key = spec.toString();
    }
};

module.exports = LevelOp;