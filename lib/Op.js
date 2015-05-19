var Spec = require('./Spec');

// empty value is '', not null, not undefined
function Op (spec, value, source) {
    if (value!==undefined) { // construct
        this.spec = new Spec(spec);
        this.value = value.toString();
        this.source = source || null;
    } else if ('spec' in spec) { // clone
        var orig = spec;
        this.spec = new Spec(orig.spec);
        this.value = orig.value.toString();
        this.source = orig.source;
    }
}
module.exports = Op;

Op.ext_line_re = /[ \t]+(\S+)[ \t]*(.*)\n/mg;
Op.op_re = /^(\S+)[ \t]*(?:(.+)\n|\n((?:[ \t]+.+\n)*))/mg;

Op.parse = function (str, source) {
    var spec, value;
    Op.op_re.lastIndex = 0;
    var m = Op.op_re.exec(str);
    var s = new Spec(m[1]), v = m[2] || m[3];
    return new Op(s, v, source);
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
