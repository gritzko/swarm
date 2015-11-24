"use strict";
var stamp = require('swarm-stamp');

//  S P E C I F I E R
//
//  The Swarm aims to switch fully from the classic HTTP
//  request-response client-server interaction pattern to continuous
//  real-time synchronization (WebSocket), possibly involving
//  client-to-client interaction (WebRTC) and client-side storage
//  (WebStorage). That demands (a) unification of transfer and storage
//  where possible and (b) transferring, processing and storing of
//  fine-grained changes.
//
//  That's why we use compound event identifiers named *specifiers*
//  instead of just regular "plain" object ids everyone is so used to.
//  Our ids have to fully describe the context of every small change as
//  it is likely to be delivered, processed and stored separately from
//  the rest of the related state.  For every atomic operation, be it a
//  field mutation or a method invocation, a specifier contains its
//  class, object id, a method name and, most importantly, its
//  version id.
//
//  A serialized specifier is a sequence of Base64 tokens each prefixed
//  with a "quant". A quant for a class name is '/', an object id is
//  prefixed with '#', a method with '.' and a version id with '!'.  A
//  special quant '+' separates parts of each token.  For example, a
//  typical version id looks like "!7AMTc+gritzko" which corresponds to
//  a version created on Tue Oct 22 2013 08:05:59 GMT by @gritzko (see
//  Host.time()).
//
//  A full serialized specifier looks like
//        /TodoItem#7AM0f+gritzko.done!7AMTc+gritzko
//  (a todo item created by @gritzko was marked 'done' by himself)
//
//  Specifiers are stored in strings, but we use a lightweight wrapper
//  class Spec to parse them easily. A wrapper is immutable as we pass
//  specifiers around a lot.

function Spec(str, quant) {
    if (str && str.constructor === Spec) {
        this.value = str.value;
    } else {
        str = (str || '').toString();
        if (Spec.reSpec.test(str)) {
            this.value = str;
        } else if (quant && Spec.reQuant.test(quant) && Spec.reTok.test(str)) {
            this.value = quant + str;
        } else {
            this.value = '';
            if (str) {
                throw new Error('malformed spec');
            }
        }
    }
}
module.exports = Spec;

Spec.prototype.filter = function (quants) {
    var filterfn = //typeof(quants)==='function' ? quants :
                function (token, quant) {
                    return quants.indexOf(quant) !== -1 ? token : '';
                };
    return new Spec(this.value.replace(Spec.reQTokExt, filterfn));
};
Spec.pattern = function (spec) {
    return spec.toString().replace(Spec.reQTokExt, '$1');
};
Spec.prototype.isEmpty = function () {
    return this.value==='';
};
Spec.prototype.pattern = function () {
    return Spec.pattern(this.value);
};
Spec.prototype.token = function (quant, index) {
    var at = quant ? this.value.indexOf(quant, this.index) : this.index;
    if (at === -1) {
        return undefined;
    }
    Spec.reQTokExt.lastIndex = at;
    var m = Spec.reQTokExt.exec(this.value);
    this.index = Spec.reQTokExt.lastIndex;
    if (!m) {
        return undefined;
    }
    return {quant: m[1], body: m[2], bare: m[3], ext: m[4]};
};
Spec.prototype.get = function specGet(quant) {
    var i = this.value.indexOf(quant);
    if (i === -1) {
        return '';
    }
    Spec.reQTokExt.lastIndex = i;
    var m = Spec.reQTokExt.exec(this.value);
    return m && m[2];
};
Spec.prototype.toks = function specGet(quant) {
    var value = quant ? this.filter(quant).value : this.value;
    return value.match(Spec.reQTokExt);
};
Spec.prototype.tok = function specGet(quant) {
    var i = this.value.indexOf(quant);
    if (i === -1) { return ''; }
    Spec.reQTokExt.lastIndex = i;
    var m = Spec.reQTokExt.exec(this.value);
    return m && m[0];
};
Spec.prototype.has = function specHas(quant) {
    if (quant.length===1) {
        return this.value.indexOf(quant) !== -1;
    } else {
        var toks = this.value.match(Spec.reQTokExt);
        return toks.indexOf(quant) !== -1;
    }
};
Spec.prototype.set = function specSet(spec, quant) {
    var ret = new Spec(spec, quant);
    var m;
    Spec.reQTokExt.lastIndex = 0;
    while (null !== (m = Spec.reQTokExt.exec(this.value))) {
        if (!ret.has(m[1])) {
            ret = ret.add(m[0]);
        }
    }
    return ret.sort();
};
Spec.prototype.version = function () { return this.get('!'); };
Spec.prototype.op = function () { return this.get('.'); };
Spec.prototype.type = function () { return this.get('/'); };
Spec.prototype.id = function () { return this.get('#'); };
Spec.prototype.typeid = function () { return this.filter('/#'); };
// The session that originated the event, author+session id, eg gritzko+123
Spec.prototype.source = function () {
    var v = this.get('!');
    var p = v.indexOf('+');
    return p===-1 ? '' : v.substr(p+1);
};
Spec.prototype.author = function () {
    var src = this.source();
    var ai = src.indexOf('~');
    return ai===-1 ? src : src.substr(0,ai);
};

Spec.prototype.sort = function () {
    function Q(a, b) {
        var qa = a.charAt(0), qb = b.charAt(0), q = Spec.quants;
        return (q.indexOf(qa) - q.indexOf(qb)) || (a < b);
    }

    var split = this.value.match(Spec.reQTokExt);
    return new Spec(split ? split.sort(Q).join('') : '');
};

Spec.prototype.add = function (spec, quant) {
    if (spec.constructor !== Spec) {
        spec = new Spec(spec, quant);
    }
    return new Spec(this.value + spec.value);
};
Spec.prototype.toString = function () { return this.value; };

/*
Spec.int2base = function (i, padlen) {
    if (i < 0 || i >= (1 << 30)) {
        throw new Error('out of range');
    }
    var ret = '', togo = padlen || 5;
    for (; i || (togo > 0); i >>= 6, togo--) {
        ret = Spec.base64.charAt(i & 63) + ret;
    }
    return ret;
};*/

Spec.prototype.fits = function (specFilter) {
    var myToks = this.value.match(Spec.reQTokExt);
    var filterToks = specFilter.match(Spec.reQTokExt), tok;
    while (tok=filterToks.pop()) {
        if (myToks.indexOf(tok) === -1) {
            return false;
        }
    }
    return true;
};


Spec.base2int = function (base) {
    var ret = 0, l = base.match(Spec.re64l);
    for (var shift = 0; l.length; shift += 6) {
        ret += Spec.base64.indexOf(l.pop()) << shift; // TODO performance
    }
    return ret;
};
Spec.parseToken = function (token_body) {
    Spec.reTokExt.lastIndex = -1;
    var m = Spec.reTokExt.exec(token_body);
    if (!m) {
        return null;
    }
    return {bare: m[1], ext: m[2] || 'swarm'}; // FIXME not generic
};

Spec.base64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_'+
              'abcdefghijklmnopqrstuvwxyz~';
Spec.rT = '[0-9A-Za-z_~]{1,80}'; // 60*8 bits is enough for everyone
Spec.reTok = new RegExp('^'+Spec.rT+'$'); // plain no-extension token
Spec.re64l = new RegExp('[0-9A-Za-z_~]', 'g');
Spec.quants = ['/', '#', '!', '.'];
Spec.rsTokExt = '^(=)(?:\\+(=))?$'.replace(/=/g, Spec.rT);
Spec.reTokExt = new RegExp(Spec.rsTokExt);
Spec.reTok = new RegExp('^'+Spec.rsTokExt+'$');
Spec.rsQuant = "[/#\\.!\\*]";
Spec.reQuant = new RegExp('^'+Spec.rsQuant+'$');
Spec.rsQTokExt = '('+Spec.rsQuant+')((=)(?:\\+(=))?)'.replace(/=/g, Spec.rT);
Spec.reQTokExt = new RegExp(Spec.rsQTokExt, 'g');
Spec.reSpec = new RegExp('^(?:'+Spec.rsQTokExt+')*$');
Spec.rsExt = '\\+(=)'.replace(/=/g, Spec.rT);
Spec.reExt = new RegExp(Spec.rsExt, 'g');
Spec.is = function (str) {
    if (str === null || str === undefined) {
        return false;
    }
    return str.constructor === Spec ||
           '' === str.toString().replace(Spec.reQTokExt, '');
};
Spec.as = function (spec) {
    if (!spec) {
        return new Spec('');
    } else {
        return spec.constructor === Spec ? spec : new Spec(spec);
    }
};

Spec.Map = function VersionVectorAsAMap(vec) {
    this.map = {};
    if (vec) {
        this.add(vec);
    }
};
Spec.Map.prototype.add = function (versionVector) {
    var vec = new Spec(versionVector, '!'), tok;
    while (undefined !== (tok = vec.token('!'))) {
        var time = tok.bare, source = tok.ext || 'swarm';
        if (time > (this.map[source] || '')) {
            this.map[source] = time;
        }
    }
};
// for each source on either side, keep the lower ts
Spec.Map.lowerUnion = function (mapB) {
};
Spec.Map.prototype.has = function (source) {
    return source in this.map;
};
Spec.Map.prototype.covers = function (version) {
    Spec.reTokExt.lastIndex = 0;
    var m = Spec.reTokExt.exec(version);
    var ts = m[1], src = m[2] || 'swarm';
    return ts <= (this.map[src] || '');
};
Spec.Map.prototype.coversAll = function (vv) {
    vv = vv.toString();
    Spec.reTokExt.lastIndex = 0;
    var m;
    while (m = Spec.reQTokExt.exec(vv)) { // FIXME
        var q = m[1], ts = m[2], src = m[3] || 'swarm';
        if ( q==='!' && ts > (this.map[src] || '') ){
            return false;
        }
    }
    return true;
};
Spec.Map.prototype.maxTs = function () {
    var ts = null,
        map = this.map;
    for (var src in map) {
        if (!ts || ts < map[src]) {
            ts = map[src];
        }
    }
    return ts;
};
Spec.Map.prototype.minTs = function () {
};
// FIXME WTF 'trim' ?!!!!
Spec.Map.prototype.toString = function (trim) {
    trim = trim || {top: 10, rot: '0'};
    var top = trim.top || 10,
        rot = '!' + (trim.rot || '0'),
        ret = [],
        map = this.map;
    for (var src in map) {
        ret.push('!' + map[src] + (src === 'swarm' ? '' : '+' + src));
    }
    ret.sort().reverse();
    while (ret.length > top || ret[ret.length - 1] <= rot) {
        ret.pop();
    }
    return ret.join('') || '!0';
};


var stamp = require('swarm-stamp');

//
//
function ParsedSpec (spec, scope, defaults) {
    if (defaults) {
        if (defaults.constructor!==ParsedSpec) {
            defaults = new ParsedSpec(defaults);
        }
        this._type = defaults._type;
        this._id = defaults._id;
        this._stamp = defaults._stamp;
        this._op = defaults._op;
    } else {
        this._type = null;
        this._id = null;
        this._stamp = null;
        this._op = null;
    }
    if (spec && spec.constructor===ParsedSpec) {
        this._type = spec._type;
        this._id = spec._id;
        this._stamp = spec._stamp;
        this._op = spec._op;
    } else if (spec) {
        Spec.reQTokExt.lastIndex = 0;
        var m, str = spec.toString();
        while (m = Spec.reQTokExt.exec(str)) {
            var quant = m[1], tok = m[2];
            switch (quant) {
            case '/': this._type = tok; break;
            case '#': this._id = tok; break;
            case '!': this._stamp = tok; break;
            case '.': this._op = tok; break;
            }
        }
    }
    if (scope) {
        if (scope.constructor!==ParsedSpec) {
            scope = new ParsedSpec(scope);
        }
        if (scope._type) { this._type = scope._type; }
        if (scope._id) { this._id = scope._id; }
        if (scope._stamp) { this._stamp = scope._stamp; }
        if (scope._op) { this._op = scope._op; }
    }
}
Spec.Parsed = ParsedSpec;


ParsedSpec.prototype.toString = function (defaults) {
    var ret = '';
    if (this._type) {
        ret+='/'+this._type;
    }
    if (this._id) {
        ret+='#'+this._id;
    }
    if (this._stamp) {
        ret+='!'+this._stamp;
    }
    if (this._op) {
        ret+='.'+this._op;
    }
    return ret;
};


ParsedSpec.prototype.toAbbrevString = function (defaults) {
    var ret = '';
    if (this._type && this._type!==defaults._type) {
        ret+='/'+this._type;
    }
    if (this._id && this._id!==defaults._id) {
        ret+='#'+this._id;
    }
    if (this._stamp && this._stamp!==defaults._stamp) {
        ret+='!'+this._stamp;
    }
    if (this._op && this._op!==defaults._op) {
        ret+='.'+this._op;
    }
    return ret;
};


ParsedSpec.prototype.type = function () { return this._type; };
ParsedSpec.prototype.Type = function () {
    return new stamp.LamportTimestamp(this._type);
};
ParsedSpec.prototype.id = function () { return this._id; };
ParsedSpec.prototype.stamp = function () { return this._stamp; };
ParsedSpec.prototype.version = function () { return '!'+this._stamp; };
ParsedSpec.prototype.op = function () { return this._op; };
ParsedSpec.prototype.typeid = function () {
    return '/'+this._type+'#'+this._id;
};
ParsedSpec.prototype.stampop = function () {
    return '!'+this._stamp+'.'+this._op; // FIXME null values are valid!!!
};
ParsedSpec.prototype.typeId = function () {
    var clone = this.clone();
    clone._stamp = clone._op = null;
    return clone;
};
ParsedSpec.prototype.source = function () {
    if (!this._stamp) {return null;}
    var parsed = new stamp.LamportTimestamp(this._stamp);
    return parsed.source();
};
ParsedSpec.prototype.author = function () {
    var source = this.source();
    var i = source.indexOf('~');
    return i===-1 ? source : source.substring(0,i);
};
ParsedSpec.prototype.pattern = function () {
    return  (this._type?'/':'')+(this._id?'#':'')+
            (this._stamp?'!':'')+(this._op?'.':'');
};
ParsedSpec.prototype.set = function (tok, quant) {
    if (!quant) {
        if (!tok || tok.charAt(0)>='0') {
            throw new Error('malformed quant');
        } // TODO tok syntax check
        quant = tok.charAt(0);
        tok = tok.substr(1);
    }
    var clone = this.clone();
    switch (quant) {
    case '/': clone._type = tok; break;
    case '#': clone._id = tok; break;
    case '!': clone._stamp = tok; break;
    case '.': clone._op = tok; break;
    }
    return clone;
};
ParsedSpec.prototype.add = ParsedSpec.prototype.set;
ParsedSpec.prototype.setStamp = function (stamp) {
    var clone = this.clone();
    clone._stamp = stamp;
    return clone;
};
ParsedSpec.prototype.setOp = function (op_name) {
    var clone = this.clone();
    clone._op = op_name;
    return clone;
};
ParsedSpec.prototype.clone = function () {
    return new ParsedSpec(this);
};

Spec.inSubtree = function (ssn, parent_ssn) {
    if (ssn===parent_ssn) { return true; }
    if (ssn.length<=parent_ssn) { return false; }
    if (ssn.charAt(parent_ssn.length)!=='~') { return false; }
    return ssn.substr(0,parent_ssn.length)===parent_ssn;
};

ParsedSpec.prototype.filter = function (quants) {
    var result = this.clone();
    if (quants.indexOf('/') < 0) result._type = null;
    if (quants.indexOf('#') < 0) result._id = null;
    if (quants.indexOf('!') < 0) result._stamp = null;
    if (quants.indexOf('.') < 0) result._op = null;
    return result;
};
