"use strict";
const swarm = require('swarm-protocol');
const Spec = swarm.Spec;

/** just a nice thin wrapper for leveldown API */
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
     *  @param {Object} options
     */
    scan ( from, till, on_op, on_end, options ) {
        let skip_op = options && options.skipOpCreation;
        if (till===null) {
            till = from.restamp(swarm.Stamp.ERROR);
        }
        let i = this._db.iterator({
            gte: from.toString(),
            lt: till.toString(),
            keyAsBuffer: false,
            valueAsBuffer: false
        });
        let levelop_read_op = (err, key, value) => {
            if (err) {
                i.end(()=>{});
                on_end(err);
            } else if (key) {
                let op = null;
                if (!skip_op)
                    op = new swarm.Op(key, value);
                on_op(op, key, value);
                i.next(levelop_read_op);
            } else {
                i.end(()=>{});
                on_end();
            }
        };
        i.next(levelop_read_op);
    }

    /** @param {Array} ops - an array of Op to save
     *  @param {Function} callback  */
    putAll (ops, callback) {
        let batch = ops.map(op => new LevelOpPut(op));
        this._db.batch(batch, {sync: true}, callback);
    }

    put (op, callback) {
        this._db.put(op.spec.toString(), op.value, {sync: true}, callback);
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
        let dels = specs.map(spec => new LevelOpDel(spec));
        this._db.batch(dels, {sync: true}, (err) => callback && callback(err));
    }

    close (callback) {
        this._db.close(callback);
    }

}

class LevelOpPut {
    constructor(op) {
        this.type = 'put';
        this.key = op.spec.toString();
        this.value = op.value;
    }
}

class LevelOpDel {
    constructor(spec) {
        this.type = 'del';
        this.key = spec.toString();
    }
}

module.exports = LevelOp;