"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const BatchedOpStream = require('./BatchedOpStream');
const LevelOp = require('./LevelOp');
const Op = swarm.Op;
const Spec = swarm.Spec;
const Stamp = swarm.Stamp;

/** Accepts a stream of ops and subscriptions; mixes patches into the stream,
 *  replaces (un)subscriptions with reciprocal (un)subscriptions. */
class PatchOpStream extends BatchedOpStream {

    constructor (db, callback) {
        super();
        this._tips_ref = null;
        this.db = db;
        // TODO
        this._snapshotted = Object.create(null); // no tail read needed
        callback && callback();
    }

    /** @override */
    _process_op (op, done) {
        if (!op.isOn()) {
            this._batch(op);
            done();
        } else if (op.spec.Stamp.isZero()) {
            this._make_snapshot(op, done);
        } else {
            this._make_tail(op, done);
        }
    }

    _make_tail (on, done) {
        let met = false, last_stamp = Stamp.ZERO;
        this.db.scan(
            on.spec.rename(Op.STAMP_ERROR),
            null,
            o => {
                if (o.isState()) return;
                let op = o.clearstamped(on.spec.scope);
                if (met) {
                    this._batch(op);
                    last_stamp = op.spec.Stamp;
                } else if (op.spec.Stamp.eq(on.spec.Stamp)) {
                    met = true;
                }
            },
            err => {
                if (!met) {
                    this._batch(on.error('NO SUCH OP'));
                } else {
                    this._batch(new Op(on.spec.restamp(last_stamp), ''));
                }
                done();
            }
        );

    }

    _make_snapshot (on, done) {

        let snapshot = null, tail = [];
        const spec = on.spec;

        this.db.scan(
            new Spec(spec.Type, spec.Id, Op.STAMP_STATE, Stamp.ZERO),
            null,
            op => {
                if (op.isState()) {
                    snapshot = op;
                    return LevelOp.ENOUGH;
                } else {
                    tail.push(op);
                    return undefined;
                }
            },
            err => err ? done(err) : this._batch_snapshot (on, snapshot, tail.reverse(), done),
            {reverse: true}
        );

    }

    _batch_snapshot (on, snapshot, tail, done) {
        const spec = on.spec;
        const scope = spec.scope;
        if (!tail.length) {
            this._batch(snapshot.clearstamped(scope));
            return done();
        }
        let rdt = swarm.Syncable.getRDT(on);
        if (!rdt) {
            this._batch(snapshot.clearstamped(scope));
            tail.forEach(op=>this._batch(op.clearstamped(scope)));
            return done();
        }
        let o = new rdt(snapshot.value);
        tail.forEach(op => o.apply(op));
        const last_op = tail[tail.length-1];
        const state = o.toString();
        let new_snapshot = new Op(last_op.spec.remethod(Op.METHOD_STATE), state);
        this.db.replace(snapshot, new_snapshot);
        this._batch(new_snapshot.clearstamped(scope));
        done();
    }


}

module.exports = PatchOpStream;