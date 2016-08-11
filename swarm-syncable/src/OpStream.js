"use strict";
let swarm = require('swarm-protocol');
let Spec = swarm.Spec;


class OpStream {

    constructor () {
        this._listeners = null;
    }

    /** add a new listener */
    on (event, callback) {
        if (event===undefined) {
            return;
        } else if (event && event.constructor===Function) {
            callback = event;
            event = '';
        }
        if (this._listeners===null) {
            this._listeners=[];
        }
        this._listeners.push(new Filter(event, callback));
    }

    /** remove listener(s) */
    off (event, callback) {
        if (event===undefined && callback===undefined) {
            this._listeners = null;
        } else if (event.constructor===Function) {
            callback = event;
            event = '';
        }

    }

    /** emit a new op to all the interested listeners */
    _emit (op) {
        if (this._listeners) {
            this._listeners.forEach(filter => filter.consider(op));
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

}

OpStream.MUTATIONS = "^.on.off.error.~";
OpStream.HANDSHAKES = ".on.off";
OpStream.STATES = ".~";

module.exports = OpStream;

class Filter {

    constructor (string, callback) {
        this.callback = callback;
        this.negative = string && string.charAt(0)==='^';
        this._patterns = [null, null, null, null];
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

    consider (op) {
        if (this.covers(op)) {
            this.callback(op);
        }
    }

    toString () {

    }

}

Filter.rsTok = '([/#!\\.])(' + swarm.Stamp.rsTok + ')';
Filter.reTok = new RegExp(Filter.rsTok, 'g');