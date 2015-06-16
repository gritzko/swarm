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
    } else if ('spec' in spec) { // clone
        var orig = spec;
        this.spec = new Spec(orig.spec);
        this.value = orig.value.toString();
        this.source = orig.source;
    }
    // TODO efficient one-pass parsing
    this.name = this.spec.op();
    this.author = this.spec.author();
}
module.exports = Op;
Op.handshake_ops = {on:1,bundle:1,off:1};

Op.ext_line_re = /[ \t]+(\S+)[ \t]*(.*)\n/mg;
Op.op_re = /^(\S+)[ \t]*(?:(.+)\n|\n((?:[ \t]+.+\n)*))/mg;

Op.parse = function (str, source) {
    Op.op_re.lastIndex = 0;
    var m = Op.op_re.exec(str);
    var s = new Spec(m[1]), v = m[2] || m[3];
    return new Op(s, v, source);
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
    if (this.spec.op()==='bundle') {
        ret += '\n' + this.value.toString().replace(/\n(\S)/g, '\n\t$1');
    } else {
        ret += '\t' + this.value.toString() + '\n';
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
