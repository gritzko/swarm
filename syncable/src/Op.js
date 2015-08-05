"use strict";
var Spec = require('./Spec');

// immutable op
// empty value is '', not null, not undefined
function Op (spec, value, source) { // FIXME source -> peer
    if (value!==undefined) { // construct
        this.spec = new Spec(spec);
        this.value = value.toString();
        if (!source) { source = ''; }
        if (source.id) { source = source.id; }
        this.source = source.toString();
    } else if (spec && spec.spec) { // clone
        var orig = spec;
        this.spec = new Spec(orig.spec);
        this.value = orig.value.toString();
        this.source = orig.source;
    } else {
        throw new Error('args not ok');
    }
}
module.exports = Op;
Op.handshake_ops = {on:1, diff:1, off:1};

Op.ext_line_re = /[ \t]+(\S+)[ \t]*(.*)\n/mg;
Op.diff_line_re = /^(\S+\.diff)\n/g;
Op.plain_line_re = /^(\S+)[ \t]+.*\n/g;
Op.op_re = /^(\S+)(?:[ \t]+(.*)\n|\n((?:[ \t]+\S+[ \t]+.*\n)*\n))/mg;

Op.parse = function (str, source) {
    Op.op_re.lastIndex = 0;
    var rem = str, m, ops = [], d=0;
    while (m = Op.op_re.exec(rem)) {
        var s = new Spec(m[1]), v = m[2] || m[3] || '';
        ops.push(new Op(s, v, source));
        d = m.index + m[0].length;
    }
    rem = rem.substr(d);
    // comments and empty lines
    var next_nl = /\n+/g.exec(rem);
    if ( next_nl && next_nl.index===0 ) {
        rem = rem.substr(next_nl[0].length);
    } else if ( next_nl && next_nl.index>0 ) {
        // TODO detect unparseable strings
        m = Op.plain_line_re.exec(rem) || Op.diff_line_re.exec(rem);
        if (!m || m.index>0) {
            throw new Error('the input is definitely malformed: '+rem);
        }
        if (m.index>0) {
            throw new Error('garbage in the input: '+rem);
        }
        if (!Spec.is(m[1])) {
            throw new Error('the spec is definitely malformed: '+m[0]);
        }
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
Op.prototype.op = function () {
    return this.spec.op();
};
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

Op.prototype.toString = function () {
    var ret = this.spec.toString();
    var val = this.value.toString();
    if (this.spec.op()==='diff') {
        ret += '\n' + val.replace(/\n(\S)/g, '\n\t$1') + '\n';
    } else {
        ret += '\t' + val + '\n';
    }
    return ret;
};

Op.prototype.error = function (msg, src) {
    var msg50 = msg.toString().replace(/\n/g, ' ').substr(0,50);
    return new Op(this.spec.set('.error'), msg50, src);
};

/** handshake ops */
Op.prototype.reply = function (opname, value) {
    return new Op( this.spec.set('.'+opname), value||'', this.stamp() );
};

Op.prototype.relay = function (to_pipe) {
    return new Op(this.spec, this.value, to_pipe);
};
