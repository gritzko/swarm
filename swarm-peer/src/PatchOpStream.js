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
            on.spec.rename(Stamp.ZERO),
            null,
            o => {
                if (o.isState() && !o.spec.Id.eq(o.spec.Stamp)) // FIXME ?!
                    return;
                let op = o.clearstamped(on.spec.scope);
                if (met) {
                    this._batch(op);
                    last_stamp = op.spec.Stamp;
                } else if (op.spec.Stamp.eq(on.spec.Stamp)) {
                    met = true;
                    last_stamp = op.spec.Stamp;
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
            new Spec([spec.Type, spec.Id, Stamp.ZERO, Stamp.ZERO]),
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
            err => {
                if (err)
                    return done(err);
                if (snapshot) {
                    this._batch_snapshot(on, snapshot, tail.reverse(), done);
                } else {
                    this._batch(on); // unknown object
                    done();
                }
            },
            {reverse: true}
        );

    }

    _batch_snapshot (on, snapshot, tail, done) {
        const spec = on.spec;
        const scope = spec.scope;
        if (!tail.length) {
            this._batch(snapshot.clearstamped(scope));
            this._batch(on.restamped(snapshot.spec.Stamp));
            return done();
        }
        let syncable = sync.Syncable._classes[on.spec.class];
        if (!syncable) {
            this._batch(snapshot.clearstamped(scope));
            tail.forEach(op=>this._batch(op.clearstamped(scope)));
            this._batch(on.restamped(Stamp.ZERO)); /// FIXME
            return done();
        }
        let o = new syncable.RDT(snapshot.value);
        tail.forEach(op => o.apply(op));
        const last = tail[tail.length-1].clearstamped().spec;
        const state = o.toString();
        let new_snapshot = new Op(new Spec([last.Type, last.Id, last.Stamp, new Stamp(Op.METHOD_STATE, '0')]), state);
        this._batch(new_snapshot.scoped(on.scope));
        this._batch(on.restamped(new_snapshot.spec.Stamp));
        if (!snapshot.spec.Stamp.eq(snapshot.spec.Id))
            this.db.replace(snapshot, new_snapshot, done);
        else
            this.db.put(new_snapshot, done);
    }


}

module.exports = PatchOpStream;