"use strict";
var stamp = require('swarm-stamp');
var Lamp = stamp.LamportTimestamp;

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

function Spec (spec, scope, defaults) {
    if (defaults) {
        if (defaults.constructor!==Spec) {
            throw new Error('defaults is not a Spec');
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
    if (spec && spec.constructor===Spec) {
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
        if (scope.constructor!==Spec) {
            throw new Error('scope is not a Spec');
        }
        if (scope._type) { this._type = scope._type; }
        if (scope._id) { this._id = scope._id; }
        if (scope._stamp) { this._stamp = scope._stamp; }
        if (scope._op) { this._op = scope._op; }
    }
}

module.exports = Spec;

Spec.prototype.toString = function (defaults) {
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

// a type-id-stamp-op convenience factory method
// syntax validation is a responsibility of the caller
Spec.create = function (type, id, stamp, op) {
    var empty = new Spec();
    empty._type = type ? type.toString() : null;
    empty._id = id ? id.toString() : null;
    empty._stamp = stamp ? stamp.toString() : null;
    empty._op = op ? op.toString() : null;
    return empty;
};


Spec.prototype.toAbbrevString = function (defaults) {
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


Spec.prototype.type = function () { return this._type; };
Spec.prototype.id = function () { return this._id; };
Spec.prototype.stamp = function () { return this._stamp; };
Spec.prototype.version = function () { return '!'+this._stamp; };
Spec.prototype.op = function () { return this._op; };
Spec.prototype.name = Spec.prototype.op;
Spec.prototype.Type = function () { return new Lamp(this._type); };
Spec.prototype.Stamp = function () { return new Lamp(this._stamp); };
Spec.prototype.Id = function () { return new Lamp(this._id); };
Spec.prototype.typeid = function () {
    return '/'+this._type+'#'+this._id;
};
Spec.prototype.stampop = function () {
    return '!'+this._stamp+'.'+this._op; // FIXME null values are valid!!!
};
Spec.prototype.typeId = function () {
    var clone = this.clone();
    clone._stamp = clone._op = null;
    return clone;
};
Spec.prototype.origin = function () {
    if (!this._stamp) {return null;}
    var parsed = new stamp.LamportTimestamp(this._stamp);
    return parsed.origin();
};
/**
  *  @deprecated: the precise position of the user_id token depends on the
  *  replica id tree scheme. It may not even exist.
  */
Spec.prototype.author = function () {
    var origin = this.origin();
    var i = origin.indexOf('~');
    return i===-1 ? origin : origin.substring(0,i);
};
Spec.prototype.pattern = function () {
    return  (this._type?'/':'')+(this._id?'#':'')+
            (this._stamp?'!':'')+(this._op?'.':'');
};
Spec.prototype.set = function (tok, quant) {
    if (tok.constructor!==String) {
        tok = tok.toString(); // well...
    }
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

Spec.prototype.add = Spec.prototype.set;
Spec.prototype.setStamp = function (stamp) {
    var clone = this.clone();
    clone._stamp = stamp;
    return clone;
};
Spec.prototype.setOp = function (op_name) {
    var clone = this.clone();
    clone._op = op_name;
    return clone;
};
Spec.prototype.clone = function () {
    return new Spec(this);
};

Spec.inSubtree = function (ssn, parent_ssn) {
    return new Lamp(ssn).isInSubtree(parent_ssn);
};

Spec.prototype.filter = function (quants) {
    var result = this.clone();
    if (quants.indexOf('/') < 0) { result._type = null; }
    if (quants.indexOf('#') < 0) { result._id = null; }
    if (quants.indexOf('!') < 0) { result._stamp = null; }
    if (quants.indexOf('.') < 0) { result._op = null; }
    return result;
};


Spec.prototype.token = function (quant, index) {
    if (!quant || Spec.quants.indexOf(quant) === -1) {
        return undefined;
    }

    var value;
    switch (quant) {
    case '/': value = this._type; break;
    case '#': value = this._id; break;
    case '!': value = this._stamp; break;
    case '.': value = this._op; break;
    }

    Spec.reTokExt.lastIndex = 0;
    var m = Spec.reTokExt.exec(value);

    if (!m) {
        return undefined;
    }

    return {quant: quant, body: value, bare: m[1], ext: m[2]};
};

Spec.prototype.has = function specHas(quant) {
    var toks = this.pattern();
    return toks.indexOf(quant) !== -1;
};

Spec.prototype.fits = function (specFilter) {
    var myToks = this.toString().match(Spec.reQTokExt);
    var filterToks = specFilter.match(Spec.reQTokExt), tok;
    while (tok=filterToks.pop()) {
        if (myToks.indexOf(tok) === -1) {
            return false;
        }
    }
    return true;
};

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
