"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const Spec = swarm.Spec;
const Op = swarm.Op;
const OpStream = sync.OpStream;
const Stamp = swarm.Stamp;
const LevelOp = require('./LevelOp');

class PeerOpStream extends OpStream {

    /**
     * @param {LevelDOWN} db - database (key-value op storage)
     * @param {Object} options
     * @param {Function} callback
     * */
    constructor (db, options, callback) {

        super();

        this.vv = null;
        this.tips = new Map();
        this.tip_bottom = '0';
        this.db = new LevelOp(db, options, err => {
            this.vv = this.db.vv;
            callback(err, this);
        });

        this.offered_queue = [];
        this.save_queue = [];

        this.pending_scans = [];
        this.active_scans = [];

        this._save_cb = this._save_batch.bind(this);

    }


    offer (op) {
        if (this._debug)
            console.warn('}'+this._debug+'\t'+op);
        // .on : create iterator, register
        // .op : push to matching iterators
        switch (op.spec.method) {
            case Op.METHOD_STATE:   this._processState(op); break;
            case Op.METHOD_ERROR:   this._processError(op); break;
            case Op.METHOD_ON:      this._processOn(op); break;
            case Op.METHOD_OFF:     this._processOff(op); break;
            default:                this._processMutation(op);
        }
        if (!this._handle)
            this._handle = setImmediate(this._save_cb);
    }

    _save_batch () {
        let save = this.save_queue;
        this.save_queue = [];

        this.db.putAll(save, err => {
            this._handle = null;
            this._emitAll(save.map( op => op.clearstamped() ));
            if (this.save_queue.length)
                this._handle = setImmediate(this._save_cb);
        });

    }

    _processError (err) {
        this._emit(err);
    }

    _processOn (op) { // FIXME  LATE, NO EARLY!!!!!!!!

        const spec = op.spec;

        let tip = this.tips.get(op.id);
        let top = this.vv.get(op.origin);

        if (spec.Stamp.isZero())
            this.queueScan(op);
        else if (tip>'0' && spec.Stamp.value>tip)
            this._emit(op.error('UNKNOWN BASE > '+tip));
        else if (!top || top<spec.time)
            this._emit(op.error('BASE AHEAD > '+top)); // leaks max stamp
        else
            this.queueScan(op);

    }

    _processOff (off) {

        if (off.spec.class===sync.Swarm.id) {
            const origin = off.scope;
            let top = this.vv.get(origin);
            off = off.restamped(top);
        }

        this._emit(off); // FIXME order same-source same-object

    }

    _processMutation (op) {

        const spec = op.spec;

        let top = this.vv.get(op.origin);
        if (spec.time<=top) {
            return this._emit(op.error("OP REPLAY", op.spec.origin));
        }
        this.vv.add(spec.Stamp); // FIXME to LevelOp

        let tip = this.tips.get(op.id) || this.tip_bottom;
        // we guarantee unique monotonous time values by overstamping ops
        if (spec.Stamp.value <= tip)
            op = op.overstamped(swarm.Base64x64.inc(tip));
        this.tips.set(op.id, op.spec.Stamp.value);

        this.save_queue.push(op);

        this.active_scans.forEach( scan => {
            if (scan.spec.isSameObject(op.spec))
                scan.races.push(op);
        });

    }

    _processState (state_op) {
        if (!state_op.spec.Stamp.eq(state_op.spec.Id)) {
            this._emit(state_op.error('NO STATE PUSH', state_op.spec.origin));
        } else {
            this._processMutation(state_op, this.save, this.forward);
        }
    }

    _apply (op, source) {
        if (op===null) {
            const i = this.active_scans.indexOf(source);
            this.active_scans.splice(i, 1);
            this.queueScan();
        } else {
            this._emit(op);
        }
    }

    queueScan (on) {
        if (on)
            this.pending_scans.push(on);
        while (this.pending_scans.length &&
            this.active_scans.length<PeerOpStream.SCAN_CONCURRENCY) {

            const on = this.pending_scans.shift();
            const memo = {
                on,
                races: [] // FIXME test races
            };
            this.active_scans.push(memo);
            this.db.getTail(on.spec, this.endScan.bind(this, memo));

        }
    }

    endScan (memo, err, ops) {
        const races = memo.races;
        const on = memo.on;
        const i = this.active_scans.indexOf(memo);
        this.active_scans.splice(i, 1);
        let re_ops = null;
        const sync_fn = sync.Syncable._classes[on.spec.clazz];
        if (err) {
            re_ops = [on.error(err)];
        } else if (!on.spec.Stamp.isZero()) { // patch
            // if (!this.met)
            //     return this._emit(this.on_op.error('NO SUCH OP'));
            re_ops = ops.map(o => o.clearstamped(on.scope)).reverse();
            const max = re_ops.length ? re_ops[re_ops.length - 1].Stamp : Stamp.ZERO;
            re_ops.push(on.stamped(max));
        } else if (!ops.length) { // object unknown
            re_ops = [on];
        } else if (sync_fn) { // make a snapshot FIXME no state
            const state = ops.pop();
            const rdt = new sync_fn.RDT(state);
            while (ops.length)
                rdt._apply(ops.pop().clearstamped(on.scope));
            while (races.length)
                rdt._apply(races.shift());
            const new_state = rdt.toOp();
            if (!state.spec.Stamp.eq(state.spec.Id))
                this.db.replace(state, new_state, ()=>{});
            else
                this.db.put(new_state, ()=>{}); // TODO?
            re_ops = [new_state.scoped(on.scope), on.stamped(new_state.Stamp)];
        } else {
            re_ops = ops.map(o => o.clearstamped(on.scope)).reverse();
            const max = re_ops[re_ops.length - 1].Stamp;
            re_ops.push(on.stamped(max));
        }
        this._emitAll(re_ops);
    }



}

PeerOpStream.VV_SPEC = new Spec('/VV#~!0.0');
PeerOpStream.VV_PREFIX_LEN = PeerOpStream.VV_SPEC.typeid.length+1;
PeerOpStream.SCAN_CONCURRENCY = 2;

module.exports = PeerOpStream;

