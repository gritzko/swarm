"use strict";
let swarm = require('swarm-protocol');
let Spec = swarm.Spec;
let Op = swarm.Op;

/**
 *
 * */
class OpStream {

    constructor () {
        this._lstn = null;
    }


    /** add a new listener
     *  @param {String} event - a specifier filter, e.g. ".on.off"
     *  @param {Function} callback - a callback function
     *  @param {Boolean} once */
    on (event, callback, once) {
        if (event && event.constructor===Function) { // normalize
            callback = event;
            event = '';
        }
        let filter = new Filter(event, callback, once);
        if (this._lstn===null) {
            this._lstn = filter;
            this._start();
        } else if (this._lstn.constructor===Op) {
            let op = this._lstn;
            this._lstn = filter;
            this._emit(op);
        } else if (this._lstn.constructor===Filter) {
            this._lstn = [this._lstn, filter];
        } else if (this._lstn.constructor===Array) {
            if (this._lstn[0].constructor===Op) {
                let ops = this._lstn;
                this._lstn = filter;
                this._emitAll(ops);
            } else {
                this._lstn.push(filter);
            }
        } else {
            throw new Error('invalid listeners list');
        }
    }

    /** internal callback; triggered on a first listener added iff nothing
     *  has been emitted yet. */
    _start () {}

    once (event, callback) {
        if (event.constructor===Function) {
            callback = event;
            event = '';
        }
        this.on(event, callback, true);
    }

    /** remove listener(s) */
    off (event, callback) {
        if (event && event.constructor===Function) {
            callback = event;
            event = undefined;
        }

        if (this._lstn===null) {
            return;
        } else if (this._lstn.constructor===Filter) {
            if (this._lstn.callback===callback)
                this._lstn = null;
        } else if (this._lstn.constructor===Array) {
            this._lstn = this._lstn.filter( f =>
                f.constructor!==Filter ||
                (callback && f.callback !== callback) ||
                (event!==undefined && f.toString()!==event)
            );
            if (this._lstn.length===0)
                this._lstn = null;
        }
    }

    /** Emit a new op to all the interested listeners.
     *  If nobody listens yet, the op is queued to be delivered to the first
     *  listener. Call opstream.spill() to stop queueing.
     *  @param {Op} op - the op to emit */
    _emit (op) {
        if (this._lstn===null) {
            this._lstn = op;
        } else if (this._lstn.constructor===Filter) {
            if (this._lstn.offer(op, this)===OpStream.ENOUGH)
                this._lstn = null;
        } else if (this._lstn.constructor===Array) {
            if (this._lstn[0].constructor===Op) {
                this._lstn.push(op);
            } else {
                let ejects = [];
                this._lstn.forEach( f =>
                    f.offer(op, this)===OpStream.ENOUGH && ejects.push(f)
                );
                if (ejects.length) {
                    this._lstn = this._lstn.filter(f=>ejects.indexOf(f)===-1);
                    if (this._lstn.length===0)
                        this._lstn = null;
                }
            }
        } else if (this._lstn.constructor===Op) {
            this._lstn = [this._lstn, op];
        }
        // FIXME null is delivered to all listeners, _lstn:=null
        // test: emit op, end(), then on()
    }

    _emitAll (ops) {
        ops.forEach(op => this._emit(op));
    }

    spill () {
        if (this._lstn &&
            this._lstn.constructor===Array &&
            this._lstn[0].constructor===Op) {
            let ret = this._lstn;
            this._lstn = null;
            return ret;
        }
    }

    /** by default, an echo stream */
    offer (op) {
        console.log(': '+op.toString());
        this._emit(op);
    }

    offerAll (ops) {
        ops.forEach(op => this.offer(op));
    }

    end () {
        this.offer(null);
    }

    /** @param {OpStream} sink */
    pipe (sink) {
        this.on('', sink.offer.bind(sink));
        // TODO test
    }

    _end () {
        this._emit(null);
    }

    onEnd (callback) {
        this.on(null, callback);
    }

    onHandshake (callback) {
        this.on(OpStream.HANDSHAKES, callback);
    }

    onMutation (callback) {
        this.on(OpStream.MUTATIONS, callback);
    }

    onState (callback) {
        this.on(OpStream.STATES, callback);
    }

    _listFilters () {
        if (!this._filters) return '';
        let list = this._up ? '*\t' + this._up.toString() : '';
        list += this._filters.map(f =>
            f.toString()+'\t'+f.callback.toString()
        ).join('\n');
        return list;
    }

}

OpStream.MUTATIONS = "^.on.off.error.~";
OpStream.HANDSHAKES = ".on.off";
OpStream.STATES = ".~";
OpStream.ENOUGH = Symbol('enough');
OpStream.SLOW_DOWN = Symbol('slow'); // TODO relay backpressure

module.exports = OpStream;

class Filter {

    constructor (string, callback, once) {
        this.callback = callback;
        this.negative = string && string.charAt(0)==='^';
        this._patterns = [null, null, null, null];
        this.once = once;
        if (string===null) { //eof
            this._patterns = null;
            return;
        }
        let m = null;
        Filter.reTok.lastIndex = this.negative ? 1 : 0;
        while (m = Filter.reTok.exec(string)) {
            let quant = m[1], stamp = m[2], t = Spec.quants.indexOf(quant);
            if (this._patterns[t]===null) {
                this._patterns[t] = [];
            }
            this._patterns[t].push(new swarm.Stamp(stamp));
        }
    }

    covers (op) {
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
            if (bad) return this.negative;
        }
        return !this.negative;
    }

    offer (op, context) {
        if (this.callback && this.covers(op)) {
            let ret = this.callback.call(context, op, context);
            if (this.once || ret === OpStream.ENOUGH)
                return false;
            if (ret && ret.constructor === Function)
                this.callback = ret;
        }
        return true;
    }

    toString () {
        let p = this._patterns;
        if (p===null) return null; // take that (TODO)
        let ret = this.negative ? '^' : '';
        for(let q=0; q<4; q++)
            if (p[q]!==null) {
                p[q].forEach(stamp => ret+=Spec.quants[q]+stamp);
            }
        return ret;
    }

}

Filter.rsTok = '([/#!\\.])(' + swarm.Stamp.rsTok + ')';
Filter.reTok = new RegExp(Filter.rsTok, 'g');
OpStream.Filter = Filter;

OpStream.TRACE = op => console.log(op.toString());

// NOTE. batched events are not supported, asynchronize/batch listeners instead