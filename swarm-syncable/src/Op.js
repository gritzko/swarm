/**
 * *immutable* op: specifier, value and a patch (nested ops).
 * empty value is '', not null, not undefined
 */
'use strict';

import Spec from './Spec';

export default class Op {

    constructor(spec, value, source, patch) { // FIXME source -> peer
        if (value===undefined) {
            if (spec && spec.constructor===String) {
                var parsed = Op.parse(spec);
                if (parsed.ops.length!==1) {
                    throw new Error('not a serialized op');
                }
                spec = parsed.ops[0];
            }
            if (spec && spec.constructor===Op) {
                var orig = spec;
                spec = orig.spec;
                value = orig.value;
                source = orig.source;
                patch = orig.patch;
            }
        }
        this.spec = spec && spec.constructor===Spec ?
            spec : new Spec(spec);
        this.value = value ? value.toString() : '';
        this.source = source ? source.id || source.toString() : '';
        this.patch = patch || null;
        if (patch && patch.constructor!==Array) {
            throw new Error('need a patch as an array of Ops');
        }
    }

    origin() {
        return this.spec.source();
    }

    stamp() {
        return this.spec.stamp();
    }

    author() {
        return this.spec.author();
    }

    typeid() {
        return this.spec.typeid();
    }

    id() {
        return this.spec.id();
    }

    name() {
        return this.spec.op();
    }

    op() {
      return this.name();
    }

    version() {
        return this.spec.version();
    }

    unbundle() {
        return this.patch;
    }

    // FIXME make efficient
    bundleLength() {
        return this.unbundle().length;
    }

    toString(context) {
        var spec_str = context ?
            this.spec.toAbbrevString(context) : this.spec.toString();
        var line = spec_str + '\t' + this.value + '\n';
        if (this.name()==='on') {
            if (this.patch) {
                this.patch.forEach(function(o){
                    line += '\t' + o.toShortString();
                });
            }
            line += '\n';
        }
        return line;
    }

    toShortString() {
        return this.spec.stampop() + '\t' + this.value + '\n';
    }

    error(msg, src) {
        var msg50 = msg.toString().replace(/\n/g, ' ').substr(0,50);
        return new Op(this.spec.set('.error'), msg50, src||this.source);
    }

    /**
     * handshake ops
     */
    reply(opname, value) {
        return new Op( this.spec.set('.'+opname), value||'', this.source, this.patch );
    }

    relay(to_pipe) {
        return new Op(this.spec, this.value, to_pipe, this.patch );
    }
}

Op.handshake_ops = {on:1, off:1};

// Epically monumental op-parsing regexes.
Op.rsSpec = '(?:'+Spec.rsQuant+'=(?:\\+=)?)+'.replace(/=/g, Spec.rT);
Op.rsPatchOp =  '\\n[ \\t]+' + Op.rsSpec + '[ \\t]+.*';
Op.rsPatchOpB = '\\n[ \\t]+(' + Op.rsSpec + ')[ \\t]+(.*)';
Op.rsOp = '(' + Op.rsSpec+')[ \\t]+(.*)((?:' + Op.rsPatchOp + ')*)(\\n+)';
Op.reOp = new RegExp(Op.rsOp, 'mg');
Op.rePatchOp = new RegExp(Op.rsPatchOpB, 'mg');

//
Op.parse = function (str, source, context) {
    Op.reOp.lastIndex = 0;
    var rem = str, m, mm, ops = [], d=0;
    while (m = Op.reOp.exec(rem)) {
        var spec = new Spec(m[1], null, context);
        var value = m[2], patch_str = m[3], end = m[4];
        var patch = null;
        if (patch_str) {
            if (end.length<2) { // need \n\n termination
                break;
            }
            var typeId = spec.typeId();
            patch = [];
            Op.rePatchOp.lastIndex = 0;
            while (mm = Op.rePatchOp.exec(patch_str)) {
                var op_spec = new Spec(mm[1], typeId);
                patch.push(new Op(op_spec, mm[2], source));
            }
        }
        ops.push(new Op(spec, value, source, patch));
        d = m.index + m[0].length;
    }
    rem = rem.substr(d);
    // comments and empty lines
    var next_nl = /\n+/g.exec(rem);
    if ( next_nl && next_nl.index===0 ) {
        rem = rem.substr(next_nl[0].length);
        // TODO detect unparseable strings
    }
    if (rem.indexOf('\n')!==-1 && !Op.reOp.exec(rem)) {
        throw new Error('unparseable input');
    }
    if (rem.length>(1<<23)) { // 8MB op size limit? TODO
        throw new Error("large unparseable input");
    }

    return {ops: ops, remainder: rem};
};
