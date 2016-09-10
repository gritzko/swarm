"use strict";
const crypto = require('crypto');
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const peer = require('swarm-peer');
const OpStream = sync.OpStream;
const Stamp = swarm.Stamp;
const Spec = swarm.Spec;
const Op = swarm.Op;
const Swarm = sync.Swarm;
const ReplicaId = swarm.ReplicaId;
const ReplicaIdScheme = swarm.ReplicaIdScheme;
const Base64x64 = swarm.Base64x64;

/**
 *  Simple default password-based user/access management implementation.
 *  DB records (LWWObject-styled):
 *      /~Client#0login!timestamp+R.passwd  SHA-256(0login+' '+password)
 *      /~Client#0login!timestart+R.ssn+RloginSSN  // session init
 *      /~Client#0login!timestamp+R.login+RloginSSN // login record
 *
 *  Initial subscription, ssn grant, clock sync:
 *      /Swarm#dbname!0.on+0login  PASSWORD|SHA-256|STAMP:SHA-256'
 *      /Swarm#dbname!timestart+R.on+RloginSSN
 *  (return .on overloads the stamp to sync the clock)
 *  (password hashing scheme according to DBPassword: Plain|Hash|SaltedHash)
 *
 *  Reconnection:
 *      /Swarm#dbname!ABC+def.on+RloginSSN  PASSWORD|SHA-256|STAMP:SHA-256'
 *
 */
class AuthOpStream  {
// NOTE: methods are lifecycle-ordered

    /** @param {SwarmDB} db
     *  @param {SwitchOpStream} switch_stream
     *  @param {Function} callback */
    constructor (db, switch_stream, callback) {
        //super();
        this.db = db;
        this.streams = new Map();
        this._on_op_cb = this._on_op.bind(this);
        this.swtch = switch_stream;
        callback && callback();
    }

    /** @param {OpStream} stream */
    addClient (stream) {
        stream._id = this.db.now();
        stream.on(this._on_op_cb);
        this.streams.set(stream._id.value, stream);
    }

    _on_op (op, stream) {
        let ts = stream._id && stream._id.value;
        if (!ts || !this.streams.has(ts)) {
            return;
        }
        const rid = new ReplicaId(op.scope, this.db.scheme);
        if (!op.isOn() || op.spec.class!==swarm.Op.CLASS_HANDSHAKE) {
            this.denyAccess(op, stream, 'HANDSHAKE FIRST');
        } else if (op.spec.id!==this.db.id) {
            this.denyAccess(op, stream, 'WRONG DB ID');
        } else if (rid.client==='0') {
            this.denyAccess(op, stream, 'NO CLIENT ID');
        } else if (rid.session!=='0' && !rid.isClientOf(this.db.Id)) {
            this.denyAccess(op, stream, 'NOT MY CLIENT');
        } else {
            this.authenticate(op, stream, err => {
                if (err) {
                    this.denyAccess(op, stream, err);
                } else if (rid.session==='0') {
                    this.grantSsn(op, stream);
                } else {
                    this.checkSsn(op, stream);
                }
            });
        }
        return OpStream.ENOUGH; // let it buffer the rest
    }


    authenticate (op, stream, callback) {
        const replica_id = new ReplicaId(op.spec.scope, this.db.scheme);
        const client_id = replica_id.client;
        let m = op.value.match(AuthOpStream.CREDS_RE);
        if (!m)
            return callback('INVALID CREDENTIALS');
        const password = m[1];
        let salted_hash = m[2];
        // const pepper_and_hash = m[3]; TODO
        // const pepper = m[4];
        // const peppered_hash = m[5];
        if (password) {
            const add_salt = crypto.createHash('sha256');
            add_salt.update(client_id);
            add_salt.update(' ');
            add_salt.update(password);
            salted_hash = add_salt.digest('base64');
        }
        const password_spec = new Spec([
            '~Client',
            client_id,
            Stamp.ZERO,
            Stamp.ZERO
        ]);
        let pwd_rec = null;
        this.db.scan( password_spec, null,
            o => pwd_rec = o,
            err => {
                if (err)
                    return callback(err);
                if (pwd_rec===null) // no user
                    return callback('WRONG USER OR PASSWORD');
                const my_salted_hash = pwd_rec.value;
                if (my_salted_hash===salted_hash)
                    callback();
                else
                    callback('WRONG USER OR PASSWORD');
                // TODO pepper
                // hasher.update(client_stamp);
                // const my_hash = hasher.digest('base64');
            }, {
                filter: o => o.spec.method===AuthOpStream.METHOD_PASSWORD,
                reverse: true,
                limit: 1
            }
        );
    }

    denyAccess (on, stream, message) {
        this.streams.delete(stream._id.value);
        stream.offer(new Op(on.spec.rename('off')), message);
        stream.end();
    }

    grantSsn (op, stream) {
        let max = '0';
        const client_id = new ReplicaId(op.scope, this.db.scheme).client;
        let from = new Spec(AuthOpStream.CLIENT_CLASS, client_id, Stamp.ZERO, Stamp.ZERO);
        const now = this.db.time();
        this.db.scan(
            from, null,
            o => max=o.scope,
            (err, count) => { // find max
                if (err)
                    return this.denyAccess(op, stream, err);
                let new_ssn = new Base64x64(max).inc();
                if (this.db.scheme.isAbnormal(new_ssn, ReplicaIdScheme.SESSION))
                    return this.reclaimAndGrantSsn(op, stream);
                const myid = this.db.clock.id;
                let new_replica_id = ReplicaId.createId([
                    myid.primus,
                    myid.peer,
                    client_id,
                    new_ssn
                ], this.db.scheme);
                const new_on = new Op( new Spec([
                    op.spec.Type,
                    op.spec.Id,
                    now,
                    new Stamp(Op.METHOD_ON, new_replica_id)
                ]), '');
                const spec = new Spec([
                    AuthOpStream.CLIENT_CLASS,
                    client_id,
                    now,
                    new Stamp(AuthOpStream.METHOD_SSN_GRANT, new_replica_id)
                ]);
                this.db.put(new Op(spec,''), err => this.grantAccess(new_on, stream));
            },
            {
                limit: 1,
                reverse: 1,
                filter: o=>o.method===AuthOpStream.METHOD_SSN_GRANT
            }
        );
    }

    reclaimAndGrantSsn (op, stream) {
        this.denyAccess(op, stream, "SSN RECLAMATION NOT IMPL YET");
    }

    checkSsn (op, stream) {
        //~User#login!timestamp+R.grant+RloginSSN
        const replica_id = new ReplicaId(op.spec.scope, this.db.scheme);
        const spec = new Spec([
            AuthOpStream.CLIENT_CLASS,
            replica_id.client,
            Stamp.ZERO,
            Stamp.ZERO
        ]);
        let ok = false;
        // FIXME add !!stamp!! for ssn id reuse
        this.db.scan( spec, null, o=>{
            if (o.spec.method!=='grant') return;
            const id = new ReplicaId(o.spec.scope, this.db.scheme);
            if (id.session===replica_id.session) {
                ok = true;
                return peer.LevelOp.ENOUGH;
            }
        }, err=>{
            if (ok)
                this.grantAccess(op, stream);
            else
                this.denyAccess(op, stream, 'UNKNOWN SESSION');
        }, {reverse:true} );
    }

    grantAccess (on, stream) {
        stream._id = new Stamp(ts, op.scope);
        this.streams.delete(ts);
        this.swtch.addClient(stream, stream._id, on);
    }

}



const rs_sha256 = "[a-zA-Z0-9=\\/\\+]{44}";
const creds_rs = "^(\\w{8-40})|("+rs_sha256+")|(("+Base64x64.rs64x64+"):("+rs_sha256+"))$";
AuthOpStream.CREDS_RE = new RegExp(creds_rs);
AuthOpStream.METHOD_PASSWORD = 'passwd';
AuthOpStream.METHOD_SSN_GRANT = 'ssn';
AuthOpStream.CLIENT_CLASS = "~Client";

module.exports = AuthOpStream;