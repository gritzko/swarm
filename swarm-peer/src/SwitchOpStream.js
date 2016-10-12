"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const Spec = swarm.Spec;
const Stamp = swarm.Stamp;
const Op = swarm.Op;
const OpStream = sync.OpStream;
const Base64x64 = swarm.Base64x64;
const Swarm = sync.Swarm;
const ClientMeta = require('./ClientMeta');
const Client = sync.Client;
const Syncable = sync.Syncable;
const ReplicaId = swarm.ReplicaId;


/**
 *    Potentially, routes between databases and shards.
 *      * retrieve db meta and the scheme
 *    Auth flow:
 *      1. accept all streams
 *      2. wait for a handshake .on (no more than HS_WAIT_TIME)
 *      3. (if OK) request a client record from the db
 *      4. (if OK) check the credentials
 *      6. (if OK) reinject the handshake .on as an object subscription
 *      7. (if OK) assign a conn_id, send back .on, register the stream
 */
class SwitchOpStream extends OpStream {

    /** @param {LogOpStream} log
     *  @param {Stamp} db_repl_id
     *  @param {Object} options
     *  @param {Function} callback */
    constructor (db_repl_id, log, options, callback) {
        super();
        this.dbrid = new Stamp(db_repl_id);
        this.rid = null;
        this.log = log;
        this.subs = new Map();
        /** conn id ts indexed? */
        this.conns = new Map();
        /** repl id indexed? */
        this.replid2connid = new Map();
        this.pending = [];
        this.options = options || Object.create(null);
        this.clock = null;
        this.meta = null;
        this._debug = options.debug;
        log.on(this);
        const local_url = 'swarm://'+this.dbrid.origin+'@local/'+this.dbrid.value;
        this.pocket = new Client(local_url, {upstream: this}, err => {
            if (!err) {
                this.clock = this.pocket._clock;
                this.meta = this.pocket._meta;
                this.rid = new ReplicaId(this.dbrid.origin, this.meta.replicaIdScheme);
            }
            callback && callback (err);
        });
        this.replid2connid.set (this.replicaId, '0');
        this.conns.set( '0', this.pocket );
    }

    get dbId () {
        return this.dbrid.value;
    }

    get replicaId () {
        return this.dbrid.origin;
    }

    /***
     * @param {OpStream} opstream - the client op stream
     */
    on (opstream) {
        // opstream._dbrid = null;
        this.pending.push({
            stream: opstream,
            hs:     null,
            rid:    null,
            ops:    [],
            client: null
        });
    }

    off (opstream) {
        const dbrid = opstream._dbrid;
        if (!dbrid || this.repl2conn.get(dbrid)!==opstream)
            return console.warn('unknown stream');
        const connid = this.repl2conn.get(dbrid);
        this.replid2connid.delete(dbrid.origin);
        this.conns.delete(connid);
        opstream._apply(null, this);
    }

    /** an op comes from the PeerOpStream */
    _apply (op, _log) {

        if (this._debug)
            console.warn(this._debug+'<'+'\t'+op);

        if (op.isOnOff()) {

            const oid = op.object;
            const scope = op.scope;
            let sub = this.subs.get(oid);
            const conn_id = this.replid2connid.get(scope);
            if (!conn_id) return;

            if (op.isOn()) {
                if (op.isHandshake()) // send back a timestamp
                    op = op.stamped(new Stamp(conn_id, this.dbrid.origin));
                if (sub === undefined)
                    this.subs.set(oid, sub=[]);  // TODO typed array impl
                if (sub.indexOf(conn_id)===-1)
                    sub.push(conn_id);
            } else if (sub) {
                const i = sub.indexOf(conn_id);
                i !== -1 && sub.splice(i, 1);
            }

        }

        this._emit(op);

    }

    _emit_to (conn_id, op) {
        const stream = this.conns.get(conn_id);
        if (stream)
            stream._apply(op);
    }

    req4stream (stream) {
        for(let i=0; i<this.pending.length; i++) {
            const req = this.pending[i];
            if (req.stream === stream)
                return req;
        }
        return null;
    }

    /** distribute an op downstream */
    _emit (op) {
        if (this._debug)
            console.warn('{'+this._debug+'\t'+op);
        if (op.isScoped()) {
            const replid = op.scope;
            const conn_id = this.replid2connid.get(replid);
            const stream = this.conns.get(conn_id);
            stream._apply (op);
        } else {
            const sub = this.subs.get(op.object);
            if (sub)
                sub.forEach( c => this._emit_to(c, op) );
        }
    }

    /** an op from a downstream */
    offer (op, stream) {
        if (this._debug)
            console.warn('}'+this._debug+'\t'+op);

        // sanity checks - stamps, scopes
        if (op===null) {
            // TODO inject .off
            return;
        } else if (!stream._id) {
            const req = this.req4stream(stream);
            if (!req)
                throw new Error('unknown stream');
            if (!req.hs && op.isHandshake() && op.scope) {
                req.hs = op;
                req.rid = new ReplicaId(op.scope, this.meta.replicaIdScheme);
                if (req.stream===this.pocket)
                    return this._accept(req);
                req.client = this.pocket.get(
                    ClientMeta.RDT.Class,
                    req.rid.client,
                    this._auth_client.bind(this, req)
                );
            } else if (!req.hs) {
                this._deny (req, 'HANDSHAKE FIRST');
            } else {
                req.ops.push(op);
            }
            return;
        } else if (Base64x64.isAbnormal(op.class) && stream!==this.pocket) {
            op = op.error('PRIVATE CLASS', stream._id.origin);
        } else if (!Syncable.getClass(op.class)) {
            op = op.error('CLASS UNKNOWN', stream._id.origin);
        } else if (op.isOnOff()) {
            if (stream._id.origin !== op.scope)
                op = op.error('WRONG SCOPE', stream._id.origin);
        } else {
            if (stream._id.origin !== op.origin)
                op = op.error('WRONG ORIGIN', stream._id.origin);
        }

        if (this._debug)
            console.warn(this._debug+'>'+'\t'+op);

        this.log.offer(op);

    }

    _deny (hs_obj, message) {
        if (hs_obj.hs)
            hs_obj.stream._apply(hs_obj.hs.error(message));
        hs_obj.stream._apply(null);
    }

    _assign_ssn (req) {
        // TODO getScoped
        const max_rid = req.client.get('max_ssn', this.replicaId) || '0';
        const next_rid = this.rid.clone();
        next_rid.client = req.rid.client;
        next_rid.session = Base64x64.inc(max_rid);
        if (next_rid.session==='0')
            return this._deny(req, 'TODO: ssn id recycling');
        const rid = next_rid.toString();
        req.client.set('max_ssn', next_rid.session); //, this.replicaId);
        // req.client.setScoped('login', 'ok', rid);
        if (this._debug)
            console.warn('!'+this._debug+' assign ssn '+rid);
        return rid;
    }

    _accept (req) {
        // conn id, ssn grant
        const hs = req.hs;
        const now = this.clock.issueTimestamp().value;
        let rid;
        if (req.rid.peer==='0') { // new ssn grant
            rid = this._assign_ssn(req);
        } else {
            rid = req.rid;
        }
        req.stream._id = new Stamp(this.dbrid.value, rid);
        // register the conn
        const prev_conn_id = this.replid2connid.get(rid);
        if (prev_conn_id) {
            const prev_stream = this.conns.get(prev_conn_id);
            prev_stream._apply(null);
            this.conns.delete(prev_conn_id);
        }
        this.replid2connid.set(rid, now);
        this.conns.set(now, req.stream);
        // reinject queued ops
        if (this._debug)
            console.warn(this._debug+'>'+'\t'+hs+' ['+req.ops.length+']');
        this.log.offer(hs);
        if (req.ops.length)
            this.log.offerAll(req.ops);
    }

    _auth_client (req) {
        const client = req.client;
        let props;
        try {
            const creds = req.hs.value;
            if (creds && creds[0]==='{')
                props = JSON.parse(creds);
            else
                props = {Password: creds};
        } catch (ex) {}
        if (!props || !client.hasState()) {
            this._deny(req, 'INVALID CREDENTIALS');
        } else if (props.Password===client.get('Password')) {
            this._accept(req);
        } else {
            this._deny(req, 'INVALID CREDENTIALS');
        }
        const i = this.pending.indexOf(req);
        this.pending.splice(i, 1);
        client.close();
    }

    close (callback) {
        this._emit(null);
        this.repl2conn.forEach( (ri, ci) => this.offClientMeta(ri) );
    }

}


module.exports = SwitchOpStream;
