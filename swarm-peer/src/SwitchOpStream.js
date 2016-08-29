"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const LevelOp = require('./LevelOp');
const BatchedOpStream = require('./BatchedOpStream');
const Spec = swarm.Spec;
const Stamp = swarm.Stamp;


/** stores subscriptions to a leveldown instance, like
 *  /Type#id!connid+replica.on  ''
 *  can be abbreviated to /Type#id!connid
 * */
class Switch extends BatchedOpStream {

    /** @param {LevelOp} db */
    constructor (db) {
        super();
        this.db = db;
        this.streams = new Map();
        this._on_op_cb = this._on_op.bind(this);
    }

    /***
     * @param {OpStream} client - the client op stream
     * @param {Stamp} stream_id - unique stream identifier, including replica id
     */
    addClient (client, stream_id) {
        let repl_id = new Stamp(stream_id).origin;
        this.streams.set(repl_id, client);
        // stamp, add
        client.on(this._on_op_cb);
    }

    _process_op (op, done) {
console.log('> '+op.toString());
        if (op.isOnOff()) {
            this._process_on_off(op, done);
        } else if (op.spec.isScoped()) {
            let stream = this.streams.get(op.scope);
            stream && this._batch({op:op, streams:[stream]});
            done();
        } else {
            return this._process_fan_out(op, done);
        }
    }

    _process_on_off (op, done) {

        let spec = op.spec;
        let record = new Spec([spec.Type, spec.Id, spec.scope, Stamp.ZERO]);
        let stream = this.streams.get(spec.scope);
        if (!stream)
            return done();
        this._batch({op: op, streams:[stream]});
        if (op.isOn()) { // outgoing on => add to the table
            this.db.put(new swarm.Op(record, ''), done);
        } else { // outgoing off => remove from the table
            this.db.del(record, done);
        }

    }

    _process_fan_out (op, done) {

        let typeid = op.spec.blank('/#');

        let send = {op: op, streams: []};
        this._batch(send);

        this.db.scan(
            typeid,
            null,
            rec => {
                let stream = this.streams.get(rec.spec.time);
                if (stream) {
                    send.streams.push(stream);
                } else {
                    // TODO clear the record
                }
            },
            done,
            {}
        );

    }

    _forward_batch (sends) {
        sends.forEach( send => {
            send.streams.forEach(
                stream => stream.offer(send.op)
            );
        });
    }

    _on_op (op, stream) {
        // sanity checks - stamps, scopes
        if (op.isOnOff()) {
            let check = this.streams.get(op.spec.scope);
            if (check!==stream)
                op = op.error('invalid scope');
        } else {
            let check = this.streams.get(op.origin);
            if (check!==stream)
                op = op.error('invalid origin');
        }
        this._emit(op); // preserve batching
    }


    close (callback) {
        this._stop();
        this._emit(null);
        for(var stream of this.streams.values())
            stream.off(this._on_op_cb);
        this.db.close(callback);
    }

}

module.exports = Switch;
