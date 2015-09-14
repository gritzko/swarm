"use strict";
var Spec = require('./Spec');

// *immutable* op: specifier, value and a patch (nested ops).
// empty value is '', not null, not undefined
function Op (spec, value, source, patch) { // FIXME source -> peer
    if (spec && spec.constructor===Op) {
        var orig = spec;
        spec = orig.spec;
        value = orig.value;
        source = orig.source;
        patch = orig.patch;
    }
    this.spec = new Spec(spec);
    this.value = value ? value.toString() : '';
    this.source = source ? source.id || source.toString() : '';
    this.patch = patch || null;
}
module.exports = Op;
Op.handshake_ops = {on:1, off:1};

// Epically monumental op-parsing regexes.
Op.rsSpec = '(?:'+Spec.rsQuant+'=(?:\\+=)?)+'.replace(/=/g, Spec.rT);
Op.rsPatchOp =  '\\n[ \\t]+' + Op.rsSpec + '[ \\t]+.*';
Op.rsPatchOpB = '\\n[ \\t]+(' + Op.rsSpec + ')[ \\t]+(.*)';
Op.rsOp = '(' + Op.rsSpec+')[ \\t]+(.*)((?:' + Op.rsPatchOp + ')*)(\\n+)';
Op.reOp = new RegExp(Op.rsOp, 'mg');
Op.rePatchOp = new RegExp(Op.rsPatchOpB, 'mg');

//
Op.parse = function (str, source) {
    Op.reOp.lastIndex = 0;
    var rem = str, m, mm, ops = [], d=0;
    while (m = Op.reOp.exec(rem)) {
        var spec = new Spec(m[1]), value = m[2], patch_str = m[3], end = m[4];
        var patch = null;
        if (patch_str) {
            if (end.length<2) { // need \n\n termination
                break;
            }
            patch = [];
            Op.rePatchOp.lastIndex = 0;
            while (mm = Op.rePatchOp.exec(patch_str)) {
                patch.push(new Op(mm[1], mm[2], source));
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
    if (rem.length>(1<<23)) { // 8MB op size limit? TODO
        throw new Error("large unparseable input");
    }

    return {ops: ops, remainder: rem};
};

Op.prototype.origin = function () {
    return this.spec.source();
};
Op.prototype.stamp = function () {
    return this.spec.version(); // TODO .4 rename consistently
};
Op.prototype.author = function () {
    return this.spec.author();
};
Op.prototype.id = function () {
    return this.spec.id();
};
Op.prototype.name = function () {
    return this.spec.op();
};
Op.prototype.op = Op.prototype.name;

Op.prototype.version = function () {
    return this.spec.filter('!');
};

Op.prototype.unbundle = function () {
    var ops = [], m;
    var prefix = this.spec.filter('/#').toString();
    while (m=Op.ext_line_re.exec(this.value)) {
        var pp = new Spec(m[1]);
        ops.push(new Op(prefix+pp, m[2], this.source));
    }
    return ops;
};

// FIXME make efficient
Op.prototype.bundleLength = function () {
    return this.unbundle().length;
};

Op.prototype.toString = function () {
    var sp = this.spec.toString();
    var val = this.value.toString();
    var patch = this.patch ? '\n\t' + this.patch.join('\t') : '';
    return sp + '\t' + val + patch  + '\n';
};

Op.prototype.error = function (msg, src) {
    var msg50 = msg.toString().replace(/\n/g, ' ').substr(0,50);
    return new Op(this.spec.set('.error'), msg50, src||this.source);
};

/** handshake ops */
Op.prototype.reply = function (opname, value) {
    return new Op( this.spec.set('.'+opname), value||'', this.stamp() );
};

Op.prototype.relay = function (to_pipe) {
    return new Op(this.spec, this.value, to_pipe);
};
