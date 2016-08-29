"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const BatchedOpStream = require('./BatchedOpStream');
const LevelOp = require('./LevelOp');
const Spec = swarm.Spec;
const Op = swarm.Op;
const VV = swarm.VV;

class LogOpStream extends BatchedOpStream {

    /**
     * @param {LevelOp} db - database (key-value op storage)
     * @param {Function} callback
     * */
    constructor (db, callback) {

        super();

        this.vv = new VV();
        this.tips = new Map();
        this.tip_bottom = '0';
        this.db = db;

        this.db.scan(
            LogOpStream.VV_SPEC,
            null,
            (nothing, key, value) => {
                let origin = key.substr(LogOpStream.VV_PREFIX_LEN);
                this.vv.addPair(value, origin);
                if (value>this.tip_bottom)
                    this.tip_bottom = value;
            },
            err => callback && callback(err),
            { skipOpCreation: true }
        );

    }

    _process (done) {

        let save = [];
        let emit = this._egress_batch;

        this._processed_batch.reverse().forEach( op => { // FIXME reverse

            if (op.isOnOff())
                this._processOnOff(op, save, emit);
            else
                this._processMutation(op, save, emit);

        });

        this._processed_batch = [];

        save.forEach(o=>console.log('SAVE: '+ o.toString()));
        this.db.putAll(save, done);

    }

    _processOnOff (op, save, emit) {

        const spec = op.spec;

        let tip = this.tips.get(op.id);
        let top = this.vv.get(op.origin);

        if (spec.Stamp.isZero())
            emit.push(op);
        else if (tip && spec.stamp>tip)
            emit.push(op.error('UNKNOWN BASE'));
        else if (!top || top<spec.time)
            emit.push(op.error('UNKNOWN BASE')); // leaks max stamp
        else
            emit.push(op);

    }

    _processMutation (op, save, emit) {

        const spec = op.spec;

        let top = this.vv.get(op.origin);

        if (top && spec.time<=top) {
            emit.push(op.error("OP REPLAY"));
            return;
        } else {
            this.vv.add(spec.Stamp);
            save.push(new Op(LogOpStream.VV_SPEC.restamp(spec.origin), spec.time));
            emit.push(op);
        }

        let tip = this.tips.get(op.id) || this.tip_bottom;

        let save_op = spec.Stamp.value > tip ?
            op : op.overstamped(swarm.Base64x64.inc(tip));

        this.tips.set(op.id, save_op.spec.Stamp.value);
        save.push(save_op);

    }


}

LogOpStream.VV_SPEC = new Spec('/VV#~!0.0');
LogOpStream.VV_PREFIX_LEN = LogOpStream.VV_SPEC.typeid.length+1;

module.exports = LogOpStream;
