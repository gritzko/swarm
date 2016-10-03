"use strict";
const swarm = require('swarm-protocol');
const Spec = swarm.Spec;
const Op = swarm.Op;
const URL = require('./URL');

const MUTE=0, ONE_LSTN=1, MANY_LSTN=2, PENDING=3;

/**
 *
 * */
class OpStream {

    constructor () {
        this._lstn = null;
        this._id = null;
        this._debug = null;
    }

    _lstn_state () {
        if (this._lstn===null)
            return MUTE;
        else if (this._lstn._apply)
            return ONE_LSTN;
        else if (this._lstn.length===0 || this._lstn[0].constructor===Op)
            return PENDING;
        else if (this._lstn[0]._apply)
            return MANY_LSTN;
        else
            throw new Error('invalid _lstn');
    }

    /** add a new listener
     *  @param {OpStream} opstream - the downstream
     */
    on (opstream) {
        if (opstream.constructor===Function)
            opstream = new CallbackOpStream(opstream);
        if (!opstream._apply || opstream._apply.constructor!==Function)
            throw new Error('opstreams only');
        switch (this._lstn_state()) {
            case MUTE:
                this._lstn = opstream;
                break;
            case ONE_LSTN:
                this._lstn = [this._lstn, opstream];
                break;
            case MANY_LSTN:
                this._lstn.push(opstream);
                break;
            case PENDING:
                const ops = this._lstn;
                this._lstn = opstream;
                this._emitAll(ops);
                break;
        }
        return opstream;
    }

    onMatch (filter, opstream) {
        if (opstream.constructor===Function)
            opstream = new CallbackOpStream(opstream);
        const fs = new FilterOpStream(filter);
        fs.on(opstream);
        return this.on(fs);
    }

    onceMatch (filter, callback) {
        const fs = new FilterOpStream(filter);
        const opstream = new CallbackOpStream(callback, true);
        fs.on(opstream);
        return this.on(fs);
    }

    once (callback) {
        const opstream = new CallbackOpStream(callback, true);
        return this.on(opstream);
    }

    /** internal callback; triggered on a first listener added iff nothing
     *  has been emitted yet. */
    _start () {}

    /** remove listener(s) */
    off (opstream) {
        if (!opstream._apply)
            throw new Error("can only add/remove opstreams");
        switch (this._lstn_state()) {
            case MUTE:
                break;
            case ONE_LSTN:
                if (this._lstn === opstream)
                    this._lstn = null;
                break;
            case MANY_LSTN:
                const i = this._lstn.indexOf(opstream);
                if (i!==-1)
                    this._lstn.splice(i, 1);
                if (this._lstn.length===0)
                    this._lstn = null;
                break;
            case PENDING:
                break;
        }
        return opstream;
    }

    /** Emit a new op to all the interested listeners.
     *  If nobody listens yet, the op is queued to be delivered to the first
     *  listener. Call opstream.spill() to stop queueing.
     *  @param {Op} op - the op to emit */
    _emit (op) {
        if (this._debug)
            console.warn('{'+this._debug+'\t'+(op?op.toString():'[EOF]'));
        switch (this._lstn_state()) {
            case MUTE:
                break;
            case ONE_LSTN:
                if (this._lstn._apply(op)===OpStream.ENOUGH)
                    this._lstn = null;
                break;
            case MANY_LSTN:
                let ejects = 0, l = this._lstn;
                for(let i=0; i<l.length; i++)
                    if ( l[i] && l[i]._apply(op)===OpStream.ENOUGH ) {
                        l[i] = null;
                        ejects++;
                    }
                if (ejects>0) {
                    l = l.filter( x => x!==null );
                    this._lstn = l.length ? l : null;
                }
                break;
            case PENDING:
                this._lstn.push(op);
                break;
        }
        if (op===null)
            this._lstn = null;
    }

    _emitAll (ops) {
        ops.forEach(op => this._emit(op));
    }

    pollAll () {
        let ret = null;
        if (this._lstn_state()===PENDING) {
            ret = this._lstn;
            this._lstn = null;
        }
        return ret;
    }

    poll () {
        if (this._lstn_state()===PENDING)
            return this._lstn.shift();
        else
            return null;
    }

    /** by default, an echo stream */
    offer (op) {
        if (this._debug)
            console.warn('}'+this._debug+'\t'+op.toString());
        this._emit(op);
    }

    offerAll (ops) {
        ops.forEach(op => this.offer(op));
    }

    end () {
        this.offer(null);
    }

    onceEnd (callback) {
        this.onceMatch(null, callback);
    }

    onHandshake (callback) {
        this.onMatch(OpStream.HANDSHAKES, callback);
    }

    onMutation (callback) {
        this.onMatch(OpStream.MUTATIONS, callback);
    }

    onState (callback) {
        this.onMatch(OpStream.STATES, callback);
    }

    /*
    _listFilters () {
        if (!this._filters) return '';
        let list = this._up ? '*\t' + this._up.toString() : '';
        list += this._filters.map(f =>
            f.toString()+'\t'+f.callback.toString()
        ).join('\n');
        return list;
    }
    */

    static connect (url, options) {
        if (url.constructor!==URL)
            url = new URL(url.toString());
        const top_proto = url.scheme[0];
        const fn = OpStream._URL_HANDLERS[top_proto];
        if (!fn)
            throw new Error('unknown protocol: '+top_proto);
        return new fn(url, options);
    }

}

OpStream.MUTATIONS = "^.on.off.error.~";
OpStream.HANDSHAKES = ".on.off";
OpStream.STATES = ".~";
OpStream.ENOUGH = Symbol('enough');
OpStream.OK = Symbol('ok');
OpStream.SLOW_DOWN = Symbol('slow'); // TODO relay backpressure
OpStream._URL_HANDLERS = Object.create(null);
module.exports = OpStream;

class ZeroOpStream extends OpStream {

    constructor (url, options) {
        super();
        this.ops = [];
        this.url = new URL(url);
        if (this.url.host)
            OpStream.QUEUES[this.url.host] = this;
    }

    offer (op) {
        this.ops.push(op);
    }

}
OpStream.QUEUES = Object.create(null);
OpStream._URL_HANDLERS['0'] = ZeroOpStream;


class CallbackOpStream extends OpStream {
    
    constructor (callback, once) {
        super();
        if (!callback || callback.constructor!==Function)
            throw new Error('callback is not a function');
        this._callback = callback;
        this._once = !!once;
    }
    
    _apply (op) {
        return (this._callback(op)===OpStream.ENOUGH || this._once) ?
            OpStream.ENOUGH : OpStream.OK;
    }
    
}


class FilterOpStream extends OpStream {

    constructor (string, once) {
        super();
        this._negative = string && string.charAt(0)==='^';
        this._patterns = [null, null, null, null];
        this._once = once;
        if (string===null) { //eof
            this._patterns = null;
            return;
        }
        let m = null;
        FilterOpStream.reTok.lastIndex = this._negative ? 1 : 0;
        while (m = FilterOpStream.reTok.exec(string)) {
            let quant = m[1], stamp = m[2], t = Spec.quants.indexOf(quant);
            if (this._patterns[t]===null) {
                this._patterns[t] = [];
            }
            this._patterns[t].push(new swarm.Stamp(stamp));
        }
    }

    matches (op) {
        let pns = this._patterns;
        if (op===null || pns===null) {
            return op===null && (pns===null || pns.every(p=>p===null));
        }
        let spec = op.spec;
        for(let t=0; t<4; t++) {
            let mine = pns[t];
            if (mine===null) continue;
            let its = spec._toks[t];
            let bad = mine.every(stamp => !stamp.eq(its));
            if (bad) return this._negative;
        }
        return !this._negative;
    }
    
    _offer () {
        throw new Error('not implemented');
    }

    _apply (op, opstream) {
        if (this.matches(op))
            this._emit(op);
        return this._once || this._lstn===null ? OpStream.ENOUGH : OpStream.OK;
    }

    toString () {
        let p = this._patterns;
        if (p===null) return null; // take that (TODO)
        let ret = this._negative ? '^' : '';
        for(let q=0; q<4; q++)
            if (p[q]!==null) {
                p[q].forEach(stamp => ret+=Spec.quants[q]+stamp);
            }
        return ret;
    }

}

FilterOpStream.rsTok = '([/#!\\.])(' + swarm.Stamp.rsTok + ')';
FilterOpStream.reTok = new RegExp(FilterOpStream.rsTok, 'g');
OpStream.Filter = FilterOpStream;
