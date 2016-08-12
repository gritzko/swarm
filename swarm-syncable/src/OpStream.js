"use strict";
let swarm = require('swarm-protocol');
let Spec = swarm.Spec;


class OpStream {

    constructor () {
        this._filters = null;
    }

    /** add a new listener */
    on (event, callback) {
        if (event===undefined) {
            return;
        } else if (event && event.constructor===Function) {
            callback = event;
            event = '';
        }
        if (this._filters===null) {
            this._filters=[];
        }
        this._filters.push(new Filter(event, callback));
    }

    once (event, callback) {
        this.on(event, callback);
        let filter = this._filters[this._filters.length-1];
        filter.once = true;
    }

    /** remove listener(s) */
    off (event, callback) {
        if (event===undefined) {
            this._filters = null;
            return;
        }
        if (event.constructor===Function) {
            this._filters = this._filters.filter( f =>
                f.callback !== event
            );
        } else {
            this._filters = this._filters.filter( f =>
                f.toString()!=event ||
                (callback && f.callback!==callback)
            );
        }
    }

    /** emit a new op to all the interested listeners
     *  @param {Op} op - the op to emit */
    _emit (op) {
        let filters = this._filters;
        if (!filters) { return; }
        for(let i=0; i<filters.length; i++){
            let f = filters[i];
            if (!f.covers(op)) continue;

            let ret = f.callback(op, this);

            if (ret && ret.constructor===Function) {
                f.callback = ret;
            } else if (ret===OpStream.ENOUGH || f.once) {
                this._filters = this._filters.filter(a => a!==f);
            }

        }
    }

    /** by default, an echo stream */
    offer (op) {
        this._emit(op);
    }

    offerAll (ops) {
        ops.forEach(op => this.offer(op));
    }

    end () {
        this.offer(null);
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
        return this._filters.map(f =>
            f.toString()+'\t'+f.callback.toString()
        ).join('\n');
    }

}

OpStream.MUTATIONS = "^.on.off.error.~";
OpStream.HANDSHAKES = ".on.off";
OpStream.STATES = ".~";
OpStream.ENOUGH = Symbol('enough');

module.exports = OpStream;

class Filter {

    constructor (string, callback) {
        this.callback = callback;
        this.negative = string && string.charAt(0)==='^';
        this._patterns = [null, null, null, null];
        this.once = false;
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
        if (op===null || this._patterns===null) {
            return op===null && this._patterns===null;
        }
        let spec = op.spec;
        for(let t=0; t<4; t++) {
            let mine = this._patterns[t];
            if (mine===null) continue;
            let its = spec._toks[t];
            let bad = mine.every(stamp => !stamp.eq(its));
            if (bad) return this.negative;
        }
        return !this.negative;
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