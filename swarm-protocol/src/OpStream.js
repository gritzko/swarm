"use strict";
const swarm = require('swarm-protocol');
const Base64x64 = require('./Base64x64');
const Id = require('./Id');
const Spec = swarm.Spec;
const Op = swarm.Op;
const URL = require('./URL');

/**
 *
 * */
class OpStream {

    constructor (options) {
        this._lstn = [];
        /** db replica id: dbid-replicaid */
        this._debug = (options && options.debug) ?
            (options.debug===true?this.constructor.name[0]:options.debug) : null;
    }

    _on_upstream () {

    }

    /** internal callback; triggered on a first listener added iff nothing
     *  has been emitted yet. */
    _on_downstream () {

    }

    /** add a new listener
     *  @param {OpStream} opstream - the downstream
     */
    on (opstream) {
        if (opstream.constructor===Function)
            opstream = new CallbackOpStream(opstream);
        if (! (opstream instanceof OpStream) )
            throw new Error('opstreams only');
        this._lstn.push(opstream);
        return opstream;
    }

    off (opstream) {
        if (!opstream._emitted)
            throw new Error("can only add/remove opstreams");
        if (!this._lstn) return;
        const i = this._lstn.indexOf(opstream);
        i!==-1 && this._lstn.splice(i, 1);
    }

    once (callback) {
        const opstream = new CallbackOpStream(callback, true);
        return this.on(opstream);
    }

    onId (id, opstream) {
        const i = Id.as(id);
        return this.on( new FilterOpStream(o=>o&&o.Id.eq(i), opstream) );
    }

    onHandshake (opstream) {
        return this.on( new FilterOpStream(o=>o&&o.isHandshake(), opstream) );
    }

    onOnOff (opstream) {
        return this.on( new FilterOpStream(o=>o&&o.isOnOff(), opstream) );
    }

    onMutation (opstream) {
        return this.on( new FilterOpStream(o=>o&&!o.isAbnormal(), opstream) );
    }

    onType (id, opstream) {
        const t = Id.as(id);
        return this.on( new FilterOpStream(o=>o&&o.Type.eq(t), opstream) );
    }

    onOrigin (rid, opstream) {
        return this.on( new FilterOpStream(o=>o&&o.origin==rid, opstream) );
    }

    onEvent (name, opstream) {
        return this.on( new FilterOpStream( o=>o&&o.eventName==name, opstream ) );
    }

    onceEvent (name, opstream) {
        return this.on( new FilterOpStream( o=>o&&o.eventName==name, opstream, true ) );
    }

    /** Emit a new op to all the interested listeners.
     *  @param {Op} op - the op to emit, null for EOF */
    emit (op) {
        if (this._debug)
            console.warn('{'+this._debug+'\t'+(op?op.toString():'[EOF]'));
        let ejects = [], l = this._lstn;
        for(let i=0; i<l.length; i++)
            if ( l[i] && l[i]._emitted(op)===OpStream.ENOUGH ) {
                ejects.push(l[i]);
            }
        if (ejects.length)
            ejects.forEach( e => this.off(e) );
        if (op===null)
            this._lstn = null;
    }

    commit (op) {

    }

    /** @param {Op} op - emitted op or null for EOF */
    _emitted (op) {
        if (this._debug)
            console.warn('{'+this._debug+'\t'+op.toString());
        return this.emit(op);
    }

    /** @param {Op} op - committed op or null for source EOF
     *  @param {OpStream} source - downstream op source */
    _committed (op, source) {
        if (this._debug)
            console.warn('}'+this._debug+'\t'+op.toString());
        /** by default, an echo stream */
        this.commit(op);
    }

    emitAll (ops) {
        ops.forEach(op => this.emit(op));
    }


    commitAll (ops) {
        ops.forEach(op => this.commit(op));
    }

    end () {
        this.commit(null);
    }

    onceEnd (callback) {
        this.on( new FilterOpStream( o => o==null, new CallbackOpStream(callback) ) );
    }

    /** Normalize opstream/callback to an opstream. */
    static as (stream) {
        if (stream && stream.constructor===Function)
            return new CallbackOpStream(stream);
        if (!stream || !stream._emitted || !stream._committed)
            throw new Error('not an opstream');
        return stream;
    }

    static connect (url, options) {
        if (url.constructor!==URL)
            url = new URL(url.toString());
        const fn = OpStream._URL_HANDLERS[url.protocol];
        if (!fn)
            throw new Error('unknown protocol: '+url.protocol);
        return new fn(url, options||Object.create(null));
    }

    static listen (url, options, upstream) {
        if (url.constructor!==URL)
            url = new URL(url.toString());
        const top_proto = url.scheme[0];
        const fn = OpStream._SERVER_URL_HANDLERS[top_proto];
        if (!fn)
            throw new Error('unknown protocol: '+top_proto);
        return new fn(url, options||Object.create(null), upstream);
    }

}

OpStream.MUTATIONS = "^.on.off.error.~";
OpStream.HANDSHAKES = ".on.off";
OpStream.STATES = ".~";
OpStream.ENOUGH = Symbol('enough');
OpStream.OK = Symbol('ok');
OpStream.SLOW_DOWN = Symbol('slow'); // TODO relay backpressure
OpStream._URL_HANDLERS = Object.create(null);
OpStream._SERVER_URL_HANDLERS = Object.create(null);
module.exports = OpStream;

/** a test op stream */
class ZeroOpStream extends OpStream {

    constructor (url, options) {
        super();
        if (url) {
            this.url = new URL(url);
            const host = this.url.host;
            if (OpStream.QUEUES[host]) {
                return OpStream.QUEUES[host];
            } else {
                OpStream.QUEUES[host] = this;
            }
        } else {
            this.url = null;
        }
        this.ops = this.committed = [];
        this.emitted = [];
    }

    _committed (op) {
        this.committed.push(op);
    }

    _emitted (op) {
        this.emitted.push(op);
    }

}
OpStream.QUEUES = Object.create(null);
OpStream._URL_HANDLERS['0'] = ZeroOpStream;
OpStream.ZeroOpStream = ZeroOpStream;


class CallbackOpStream extends OpStream {

    constructor (callback, once) {
        super();
        if (!callback || callback.constructor!==Function)
            throw new Error('callback is not a function');
        this._callback = callback;
        this._once = !!once;
        this._in = false;
    }

    emit (op) {
        if (this._in) return;
        this._in = true;
        const enough = this._callback(op)===OpStream.ENOUGH;
        this._in = false; // FIXME
        return (enough || this._once) ?
            OpStream.ENOUGH : OpStream.OK;
    }

}


class FilterOpStream extends OpStream {

    constructor (filter_fn, downstream, once) {
        super();
        this._filter = filter_fn;
        this._once = once || false;
        this._fn = null;
        if (downstream) {
            if (downstream._emitted)
                this.on(downstream);
            else
                this._fn = downstream;
        }
    }

    _emitted (op) {
        if (this._filter(op)) {
            this.emit(op);
            this._fn && this._fn(op);
        }
        return this._once || this._lstn===null ? OpStream.ENOUGH : OpStream.OK;
    }

}

// FilterOpStream.rsTok = '([/#!\\.])(' + swarm.Id.rsTok + ')';
// FilterOpStream.reTok = new RegExp(FilterOpStream.rsTok, 'g');
OpStream.Filter = FilterOpStream;
