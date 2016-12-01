"use strict";
var Base64x64 = require('./Base64x64');
var Id = require('./Id');
var Spec = require('./Spec');

/**
 *  Immutable Swarm op, see the specification at
 *  https://gritzko.gitbooks.io/swarm-the-protocol/content/op.html
 * */
class Op extends Spec {

    /** @param {Object|String|Number|Array} value - op value (parsed)
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
    }

    get spec () {
        return new Spec (this);
    }

    get specifier () {
        return this.spec;
    }

    get value () {
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

    get valstr () {
        if (this._valstr===undefined) {
            // TODO strip objects
            this._valstr = this._value===null ? '' : JSON.stringify(this._value);
        }
        return this._valstr;
    }

    toString (defaults) {
        let ret = super.toString(defaults);
        if (this.valstr!=='')
            ret += '=' + this.valstr;
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

    static serializeFrame (ops, prev_spec) {
        let frame = '';
        ops.forEach( op => {
            frame += op.toString(prev_spec) + '\n';
            prev_spec = op.spec;
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
        return new Op([this.Type, this.Id, this.Stamp, Name], message);
    }

    /** @param {Base64x64|String} new_stamp */
    overstamped (new_stamp) {
        if (this.isScoped())
            throw new Error('can not overstamp a scoped op');
        return new Op([
            this.Type,
            this.Id,
            new Id(new_stamp, this.origin),
            new Id(this.method, this.time)
        ], this._value);
    }

    clearstamped (new_scope) {
        if (!this.isScoped() && !new_scope)
            return this;
        return new Op ([
            this.Type,
            this.Id,
            new Id(this.isScoped() ? this.scope : this.time, this.origin),
            new Id(this.method, new_scope||'0')
        ], this._value);
    }

    stamped (stamp) {
        return new Op([this.Type, this.Id, stamp, this.Name], this._value);
    }

    scoped (scope) {
        return new Op([
            this.Type,
            this.Id,
            this.Stamp,
            new Id(this.method, scope)
        ], this._value);
    }

    named (name, value) {
        return new Op([
            this.Type,
            this.Id,
            this.Stamp,
            name
        ], value || this._value);
    }

    static zeroStateOp (spec) {
        return new Op([spec.Type, spec.Id, Id.ZERO, Op.METHOD_STATE], '');
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

module.exports = Op;
