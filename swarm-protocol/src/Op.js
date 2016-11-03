"use strict";
var Base64x64 = require('./Base64x64');
var Stamp = require('./Stamp');
var Spec = require('./Spec');

/**
 *  Immutable Swarm op, see the specification at
 *  https://gritzko.gitbooks.io/swarm-the-protocol/content/op.html
 * */
class Op extends Spec {

    constructor (spec, value) {
        super(spec);
        this._value = value || '';
    }

    get spec () {
        return new Spec (this);
    }

    get specifier () {
        return this.spec;
    }

    get value () {
        return this._value;
    }

    toString (defaults) {
        let ret = super.toString(defaults);
        if (this._value==='') {
        } else if (this._value.indexOf('\n')===-1) {
            ret += '\t' + this._value;
        } else {
            ret += '=\n' + this._value.replace(/^(.*)$/mg, "\t$1");
        }
        return ret;
    }

    /** whether this is not a state-mutating op */
    isPseudo () {
        return Op.PSEUDO_OP_NAMES.indexOf(this.method)!==-1;
    }

    /** parse a frame of several serialized concatenated newline-
     * terminated ops. Does not parse buffers (because partial ops,
     * partial Unicode chars). */
    static parseFrame (text) {
        var ret = [];
        var m = null;
        Op.reOp.lastIndex = 0;
        let prev; // FIXME constructor
        while ( m = Op.reOp.exec(text) ) {
            let spec_str = m[1],
                empty = m[2],
                line = m[3],
                lines = m[4],
                length = m[5],
                value;
            if (!spec_str)
                continue; // empty line
            if (empty!==undefined) {
                value = '';
            } else if (line!==undefined) {
                value = line;
            } else if (lines!==undefined) {
                value = lines.replace(/\n[ \t]/mg, '\n').substr(1);
            } else { // explicit length
                var char_length = Base64x64.classic.parse(length);
                var start = Op.reOp.lastIndex;
                value = text.substr(start, char_length);
                if (text.charAt(start+char_length)!=='\n') {
                    throw new Error('unterminated op body');
                }                Op.reOp.lastIndex = start+char_length;
            }
            let spec = new Spec(spec_str, prev);
            prev = spec;
            ret.push(new Op(spec, value));
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

    isOn () { return this.method === Op.METHOD_ON; }

    isOff () { return this.method === Op.METHOD_OFF; }

    isOnOff () {
        return this.isOn() || this.isOff();
    }

    isHandshake () {
        return this.isOnOff() && this.clazz==='Swarm';
    }

    isMutation () { // FIXME abnormal vs normal
        return !this.isOnOff() && !this.isError() && !this.isState();
    }

    isState () {
        return this.method === Op.METHOD_STATE;
    }

    isNoop () {
        return this.method === Op.METHOD_NOOP;
    }

    isError () {
        return this.method === Op.METHOD_ERROR;
    }

    isNormal () {
        return !this.Name.isAbnormal() && !this.isOnOff(); // TODO ~on?
    }

    /**
     * @param {String} message
     * @param {String|Base64x64} scope - the receiver
     * @returns {Op} error op */
    error (message, scope) {
        const Name = new Stamp(Base64x64.INCORRECT, scope || '0');
        return new Op([this.Type, this.Id, this.Stamp, Name], message);
    }

    /** @param {Base64x64|String} new_stamp */
    overstamped (new_stamp) {
        if (this.isScoped())
            throw new Error('can not overstamp a scoped op');
        return new Op([
            this.Type,
            this.Id,
            new Stamp(new_stamp, this.origin),
            new Stamp(this.method, this.time)
        ], this._value);
    }

    clearstamped (new_scope) {
        if (!this.isScoped() && !new_scope)
            return this;
        return new Op ([
            this.Type,
            this.Id,
            new Stamp(this.isScoped() ? this.scope : this.time, this.origin),
            new Stamp(this.method, new_scope||'0')
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
            new Stamp(this.method, scope)
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
        return new Op([spec.Type, spec.Id, Stamp.ZERO, Op.METHOD_STATE], '');
    }

}

Op.NON_SPECIFIC_NOOP = new Op(Spec.NON_SPECIFIC_NOOP, "");
Op.SERIALIZATION_MODES = {
    LINE_BASED: 1,
    EXPLICIT: 2,
    EXPLICIT_ONLY: 3
};
Op.rsOp = '^\\n*(' + Spec.rsSpec.replace(/\((\?\:)?/mg, '(?:') + ')' +
    '(?:(\\n)|[ \\t](.*)\\n|=$((?:\\n[ \\t].*)*)|=('+Base64x64.rs64x64+')\\n)';
Op.reOp = new RegExp(Op.rsOp, "mg");
Op.METHOD_ON = "on";
Op.METHOD_OFF = "off";
Op.METHOD_STATE = Base64x64.INFINITY;
Op.METHOD_NOOP = Base64x64.ZERO;
Op.METHOD_ERROR = Base64x64.INCORRECT;
Op.PSEUDO_OP_NAMES = [Op.METHOD_ON, Op.METHOD_OFF, Op.METHOD_ERROR, Op.METHOD_NOOP];
Op.STAMP_ON = new Stamp(Op.METHOD_ON);
Op.STAMP_OFF = new Stamp(Op.METHOD_OFF);
Op.STAMP_STATE = new Stamp(Op.METHOD_STATE);
Op.STAMP_NOOP = new Stamp(Op.METHOD_NOOP);
Op.STAMP_ERROR = new Stamp(Op.METHOD_ERROR);
Op.NOTHING = new Op(new Spec(), '');
Op.CLASS_HANDSHAKE = "Swarm";

module.exports = Op;
