"use strict";
const Base64x64 = require('./Base64x64');
const Id = require('./Id');
const Spec = require('./Spec');
// const Ops = require('./Ops');

/**
 *  Immutable Swarm op, see the specification at
 *  https://gritzko.gitbooks.io/swarm-the-protocol/content/op.html
 * */
class Op extends Spec {

    /** @param {Object|String|Number|Array|Spec|Ops} value - op value (parsed)
      */
    constructor (id, type, stamp, loc, value, valstr) {
        super(id, type, stamp, loc);
        if (value===undefined) {
            this._value = valstr===undefined ? null : undefined;
            this._valstr = valstr;
        } else {
            this._value = value;
            this._valstr = valstr || undefined;
        }
        // this._ops = null;
    }

    get spec () {
        return new Spec (this);
    }

    get specifier () {
        return this.spec;
    }

    get Value () {
        if (this._value===undefined) {
            this._value = null;
            if (this._valstr) try {
                this._value = JSON.parse(this._valstr);
            } catch (ex) {
                console.warn('op parse error: '+ex.message);
            }
        }
        return this._value;
    }

    get value () {
        if (this._valstr===undefined) {
            // TODO strip objects
            this._valstr = this._value===null ? '' : JSON.stringify(this._value);
        }
        return this._valstr;
    }

    // get ops () {
    //     if (this._ops) {
    //         return this._ops;
    //     } else if (!this.value) {
    //         return null;
    //     } else if (!this.value.v || !this.value.s || !this.value.l) {
    //         return undefined;
    //     } else {
    //         this._ops = new Ops(this.value.s, this.value.l, this.value.v, this);
    //         return this._ops;
    //     }
    // }

    toString (defaults) {
        let ret = super.toString(defaults);
        if (this.value)
            ret += '=' + this.value;
        return ret;
    }

    static fromString (specstr, valstr, prevop) {
        const def = prevop || Op.ZERO;
        Spec.reSpec.lastIndex = 0;
        const m = Spec.reSpec.exec(specstr);
        if (!m) throw new Error('not a specifier');
        return new Op(
            m[1]||def._id,
            m[2]||def._type,
            m[3]||def._stamp,
            m[4]||def._loc,
            undefined,
            valstr||''
        );
    }

    /** parse a frame of several serialized concatenated newline-
     * terminated ops. Does not parse buffers (because partial ops,
     * partial Unicode chars). */
    static parseFrame (text) {
        var ret = [];
        var m = null;
        var prevop = Op.ZERO;
        let at = 0;
        Op.reOp.lastIndex = 0;
        while ( m = Op.reOp.exec(text) ) {
            if (m.index!==at)
                throw new Error('garbage in the input: '+text.substring(at,m.index));
            const specstr = m[1],
                  valstr = m[2];
            if (!specstr)
                continue; // empty line
            const op = Op.fromString(specstr, valstr, prevop);
            ret.push(op);
            prevop = op;
            at = Op.reOp.lastIndex;
        }
        if (Op.reOp.lastIndex!==0) {
            throw new Error("mismatched content");
        }
        return ret;
    }

    static serializeFrame (ops, prev_op) {
        let frame = '';
        ops.forEach( op => {
            frame += op.toString(prev_op) + '\n';
            prev_op = op;
        });
        frame += '\n'; // frame terminator
        return frame;
    }
    /**
     * @param {String} message
     * @param {String|Base64x64} scope - the receiver
     * @returns {Op} error op */
    error (message, scope) {
        const Name = new Id(Base64x64.INCORRECT, scope || '0');
        return new Op(this.Id, this.Type, this.Stamp, Name, message);
    }

    stamped (stamp) {
        return new Op(this.Type, this.Id, stamp, this.Name, this._value);
    }

    scoped (scope) {
        return new Op(
            this.Id,
            this.Type,
            this.Stamp,
            new Id(this.method, scope),
        this._value);
    }

    named (name, value) {
        return new Op(
            this.Id,
            this.Type,
            this.Stamp,
            name,
            value || this._value
        );
    }

    static zeroStateOp (spec) {
        const s = Spec.as (spec);
        return new Op(s.Id, s.Type, Id.ZERO, Spec.STATE_OP_NAME, null);
    }

    static reduce (state, op) {
        if (!state.isSameObject(op)) // TODO null => diff
            throw new Error('wrong object');
        const reducer = Op.REDUCERS[state.type] || log_reducer;
        const value = reducer(state, op);
        return new Op(op.Id, op.Type, op.Stamp, Spec.STATE_OP_NAME, value);
    }

}


Op.NON_SPECIFIC_NOOP = new Op(Spec.NON_SPECIFIC_NOOP, "");
Op.SERIALIZATION_MODES = {
    LINE_BASED: 1,
    EXPLICIT: 2,
    EXPLICIT_ONLY: 3
};
const rsSpecEsc = Spec.rsSpec.replace(/\((\?\:)?/mg, '(?:');
Op.rsOp = '^\\n*(' + rsSpecEsc + ')' + '(?:\\=(.*))?\\n';
Op.reOp = new RegExp(Op.rsOp, "mg");

Op.ZERO = new Op(new Spec(), null);
Op.CLASS_HANDSHAKE = "Swarm";

Op.DB_TYPE_NAME = 'db';
Op.DB_TYPE_ID = new Id(Op.DB_TYPE_NAME);

Op.REDUCERS = Object.create(null);

function log_reducer (state, op) {
    return null;
}

function lww_reducer (state, op) {
    const ops = state.ops;
    const i = ops.findLoc(op.Loc);
    return ops.splice(i, 1, [op]);
}

Op.REDUCERS.json = lww_reducer;
Op.REDUCERS.db = lww_reducer;
Op.REDUCERS.log = log_reducer;

module.exports = Op;
