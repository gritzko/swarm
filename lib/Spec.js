'use strict';

function Spec (str,quant) {
    if (str && str.constructor===Spec) {
        str=str.value;
    } else { // later we assume value has valid format
        str = (str||'').toString();
        if (quant && str.charAt(0)>='0')
            str = quant + str;
        if (str.replace(Spec.reQTokExt,''))
            throw new Error('malformed specifier: '+str);
    }
    this.value = str;
    this.index = 0;
}

Spec.prototype.filter = function (quants) {
    return new Spec(
        this.value.replace(Spec.reQTokExt,function (token,quant) {
            return quants.indexOf(quant)!==-1 ? token : '';
        })
    );
};

Spec.pattern = function (spec) {
    return spec.toString().replace(Spec.reQTokExt,'$1');
};

Spec.prototype.pattern = function () {
    return Spec.pattern(this.value);
};

Spec.prototype.token = function (quant) {
    var at = quant ? this.value.indexOf(quant,this.index) : this.index;
    if (at===-1) return undefined;
    Spec.reQTokExt.lastIndex = at;
    var m=Spec.reQTokExt.exec(this.value);
    this.index = Spec.reQTokExt.lastIndex;
    if (!m) return undefined;
    return { quant: m[1], body: m[2], bare: m[3], ext: m[4] };
};

Spec.prototype.get = function specGet (quant) {
    var i = this.value.indexOf(quant);
    if (i===-1) return '';
    Spec.reQTokExt.lastIndex = i;
    var m=Spec.reQTokExt.exec(this.value);
    return m&&m[2];
};

Spec.prototype.has = function specHas (quant) {
    return this.value.indexOf(quant)!==-1;
};

Spec.prototype.set = function specSet (spec,quant) {
    var ret = new Spec(spec,quant), m=[];
    Spec.reQTokExt.lastIndex = 0;
    while (m=Spec.reQTokExt.exec(this.value))
        ret.has(m[1]) || (ret=ret.add(m[0]));
    return ret.sort();
};

Spec.prototype.version = function () { return this.get('!') };
Spec.prototype.op = function () { return this.get('.') };
Spec.prototype.type = function () { return this.get('/') };
Spec.prototype.id = function () { return this.get('#') };
Spec.prototype.typeid = function () { return this.filter('/#') };
Spec.prototype.source = function () { return this.token('!').ext };

Spec.prototype.sort = function () {
    function Q (a, b) {
        var qa = a.charAt(0), qb = b.charAt(0), q = Spec.quants;
        return (q.indexOf(qa) - q.indexOf(qb)) || (a<b);
    }
    var split = this.value.match(Spec.reQTokExt);
    return new Spec(split?split.sort(Q).join(''):'');
};

/** mutates */
Spec.prototype.add = function (spec,quant) {
    if (spec.constructor!==Spec)
        spec = new Spec(spec,quant);
    return new Spec(this.value+spec.value);
};

Spec.prototype.toString = function () { return this.value };


Spec.int2base = function (i,padlen) {
    var ret = '', togo=padlen||5;
    for (; i||(togo>0); i>>=6, togo--)
        ret = Spec.base64.charAt(i&63) + ret;
    return ret;
};

Spec.base2int = function (base) {
    var ret = 0, l = base.match(Spec.re64l);
    for (var shift=0; l.length; shift+=6)
        ret += Spec.base64.indexOf(l.pop()) << shift;
    return ret;
};

Spec.parseToken = function (token_body) {
    Spec.reTokExt.lastIndex = -1;
    var m = Spec.reTokExt.exec(token_body);
    if (!m) return null;

    return { bare: m[1], ext: m[2] || 'swarm' }; // FIXME not generic
};

Spec.base64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~';
Spec.rT = '[0-9A-Za-z_~]+';
Spec.re64l = new RegExp('[0-9A-Za-z_~]','g');
Spec.quants = ['/','#','!','.'];
Spec.reTokExt = new RegExp('^(=)(?:\\+(=))?$'.replace(/=/g,Spec.rT));
Spec.reQTokExt = new RegExp('([/#\\.!\\*])((=)(?:\\+(=))?)'.replace(/=/g,Spec.rT),'g');
Spec.is = function (str) {
    if (str===null || str===undefined) return false;
    return str.constructor===Spec || ''===str.toString().replace(Spec.reQTokExt,'');
};
Spec.as = function (spec) {
    if (!spec) {
        return new Spec('');
    } else {
        return spec.constructor === Spec ? spec : new Spec(spec);
    }
};

module.exports = Spec;
