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
     * @param {SwarmDB} db - database (key-value op storage)
     * @param {Function} callback
     * */
    constructor (db, callback) {

        super();

        this.vv = null;
        this.tips = new Map();
        this.tip_bottom = '0';
        this.db = db;

        this.db.read_vv( (err, vv) => {
            this.vv = vv;
            callback(err);
        } );

    }

    _process (done) {

        let save = [];
        let emit = this._egress_batch;

        this._processed_batch.reverse().forEach( op => { // FIXME reverse

            if (op.isNormal()) {
                this._processMutation(op, save, emit);
            } else if (op.isOnOff()) {
                this._processOnOff(op, save, emit);
            } else if (op.isError()) {
                emit.push(op);
            } else if (op.isState()) {
                this._processState(op, save, emit);
            }
        });

        this._processed_batch = [];

        this.db.putAll(save, done);

    }

    _processOnOff (op, save, emit) {

        const spec = op.spec;

        let tip = this.tips.get(op.id);
        let top = this.vv.get(op.origin);

        if (spec.Stamp.isZero())
            emit.push(op);
        else if (tip>'0' && spec.Stamp.value>tip)
            emit.push(op.error('UNKNOWN BASE > '+tip));
        else if (!top || top<spec.time)
            emit.push(op.error('BASE AHEAD > '+top)); // leaks max stamp
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
            emit.push(op);
        }

        let tip = this.tips.get(op.id) || this.tip_bottom;

        // we guarantee unique monotonous time values by overstamping ops
        let save_op = spec.Stamp.value > tip ?
            op : op.overstamped(swarm.Base64x64.inc(tip));

        this.tips.set(op.id, save_op.spec.Stamp.value);
        save.push(save_op);

    }

    _processState (state_op, save, emit) {
        if (!state_op.spec.Stamp.eq(state_op.spec.Id)) {
            emit.push(state_op.error('INIT STATE ONLY'));
        } else {
            this._processMutation(state_op, save, emit);
        }
    }


}

LogOpStream.VV_SPEC = new Spec('/VV#~!0.0');
LogOpStream.VV_PREFIX_LEN = LogOpStream.VV_SPEC.typeid.length+1;

module.exports = LogOpStream;
