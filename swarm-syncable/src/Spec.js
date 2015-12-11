/**
 * S P E C I F I E R
 *
 * The Swarm aims to switch fully from the classic HTTP
 * request-response client-server interaction pattern to continuous
 * real-time synchronization (WebSocket), possibly involving
 * client-to-client interaction (WebRTC) and client-side storage
 * (WebStorage). That demands (a) unification of transfer and storage
 * where possible and (b) transferring, processing and storing of
 * fine-grained changes.
 *
 * That's why we use compound event identifiers named *specifiers*
 * instead of just regular "plain" object ids everyone is so used to.
 * Our ids have to fully describe the context of every small change as
 * it is likely to be delivered, processed and stored separately from
 * the rest of the related state.  For every atomic operation, be it a
 * field mutation or a method invocation, a specifier contains its
 * class, object id, a method name and, most importantly, its
 * version id.
 *
 * A serialized specifier is a sequence of Base64 tokens each prefixed
 * with a "quant". A quant for a class name is '/', an object id is
 * prefixed with '#', a method with '.' and a version id with '!'.  A
 * special quant '+' separates parts of each token.  For example, a
 * typical version id looks like "!7AMTc+gritzko" which corresponds to
 * a version created on Tue Oct 22 2013 08:05:59 GMT by @gritzko (see
 * Host.time()).
 *
 * A full serialized specifier looks like
 *       /TodoItem#7AM0f+gritzko.done!7AMTc+gritzko
 * (a todo item created by @gritzko was marked 'done' by himself)
 *
 * Specifiers are stored in strings, but we use a lightweight wrapper
 * class Spec to parse them easily. A wrapper is immutable as we pass
 * specifiers around a lot.
 *
 * @flow
 */
'use strict';

import {LamportTimestamp} from 'swarm-stamp';

export default class Spec {

    _type: ?string;
    _id: ?string;
    _stamp: ?string;
    _op: ?string;

    constructor(spec: ?string | Spec, scope: ?Spec, defaults: ?Spec) {
        if (defaults) {
            if (defaults.constructor!==Spec) {
                defaults = new Spec(defaults);
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
        if (spec && (spec instanceof Spec)) {
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
                scope = new Spec(scope);
            }
            if (scope._type) { this._type = scope._type; }
            if (scope._id) { this._id = scope._id; }
            if (scope._stamp) { this._stamp = scope._stamp; }
            if (scope._op) { this._op = scope._op; }
        }
    }

    toString(defaults: any): string {
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
    }

    toAbbrevString(defaults: Spec): string {
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
    }

    type(): ?string {
      return this._type;
    }

    Type(): LamportTimestamp {
        return new LamportTimestamp(this._type);
    }

    id(): ?string {
      return this._id;
    }

    stamp(): ?string {
      return this._stamp;
    }

    version(): string {
      return '!'+String(this._stamp);
    }

    op(): ?string {
      return this._op;
    }

    typeid(): string {
        return '/'+String(this._type)+'#'+String(this._id);
    }

    stampop(): string {
        return '!'+String(this._stamp)+'.'+String(this._op); // FIXME null values are valid!!!
    }

    typeId(): Spec {
        var clone = this.clone();
        clone._stamp = clone._op = null;
        return clone;
    }

    source(): ?string {
        if (!this._stamp) {return null;}
        var parsed = new LamportTimestamp(this._stamp);
        return parsed.source();
    }

    author(): ?string {
        var source = this.source();
        if (!source) {
          return null;
        }
        var i = source.indexOf('~');
        return i===-1 ? source : source.substring(0,i);
    }

    pattern(): string {
        return  (this._type?'/':'')+(this._id?'#':'')+
                (this._stamp?'!':'')+(this._op?'.':'');
    }

    set(tok: string, quant: ?string): Spec {
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
    }

    add(tok: string, quant: string): Spec {
      return this.set(tok, quant);
    }

    setStamp(stamp: string): Spec {
        var clone = this.clone();
        clone._stamp = stamp;
        return clone;
    }

    setOp(op_name: string): Spec {
        var clone = this.clone();
        clone._op = op_name;
        return clone;
    }

    clone(): Spec {
        return new Spec(this);
    }

    filter(quants: Array<string>): Spec {
        var result = this.clone();
        if (quants.indexOf('/') < 0) { result._type = null; }
        if (quants.indexOf('#') < 0) { result._id = null; }
        if (quants.indexOf('!') < 0) { result._stamp = null; }
        if (quants.indexOf('.') < 0) { result._op = null; }
        return result;
    }

    token(quant: string, index: any) {
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

        if (!value) {
          return undefined;
        }

        Spec.reTokExt.lastIndex = 0;
        var m = Spec.reTokExt.exec(value);

        if (!m) {
            return undefined;
        }

        return {quant: quant, body: value, bare: m[1], ext: m[2]};
    }

    has(quant: string): boolean {
        var toks = this.pattern();
        return toks.indexOf(quant) !== -1;
    }

    fits(specFilter: string): boolean {
        var myToks = this.toString().match(Spec.reQTokExt) || [];
        var filterToks = specFilter.match(Spec.reQTokExt) || [];
        var tok;
        while (tok=filterToks.pop()) {
            if (myToks.indexOf(tok) === -1) {
                return false;
            }
        }
        return true;
    }

    /**
     * a type-id-stamp-op convenience factory method
     * syntax validation is a responsibility of the caller
     */
    static create(type, id, stamp, op) {
        var empty = new Spec();
        empty._type = type ? type.toString() : null;
        empty._id = id ? id.toString() : null;
        empty._stamp = stamp ? stamp.toString() : null;
        empty._op = op ? op.toString() : null;
        return empty;
    }

    static is(str) {
        if (str === null || str === undefined) {
            return false;
        }
        return str.constructor === Spec ||
              '' === str.toString().replace(Spec.reQTokExt, '');
    }

    static as(spec) {
        if (!spec) {
            return new Spec('');
        } else {
            return spec.constructor === Spec ? spec : new Spec(spec);
        }
    }

    static inSubtree(ssn, parent_ssn) {
        if (ssn===parent_ssn) { return true; }
        if (ssn.length<=parent_ssn) { return false; }
        if (ssn.charAt(parent_ssn.length)!=='~') { return false; }
        return ssn.substr(0,parent_ssn.length)===parent_ssn;
    }

    static base2int(base) {
        var ret = 0, l = base.match(Spec.re64l);
        for (var shift = 0; l.length; shift += 6) {
            ret += Spec.base64.indexOf(l.pop()) << shift; // TODO performance
        }
        return ret;
    }

    static parseToken(token_body) {
        Spec.reTokExt.lastIndex = -1;
        var m = Spec.reTokExt.exec(token_body);
        if (!m) {
            return null;
        }
        return {bare: m[1], ext: m[2] || 'swarm'}; // FIXME not generic
    }

    // $FlowFixMe: when it supports static prop initializers.
    static base64 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_'+
                    'abcdefghijklmnopqrstuvwxyz~';
    // $FlowFixMe: when it supports static prop initializers.
    static rT = '[0-9A-Za-z_~]{1,80}'; // 60*8 bits is enough for everyone
    // $FlowFixMe: when it supports static prop initializers.
    static reTok = new RegExp('^'+Spec.rT+'$'); // plain no-extension token
    // $FlowFixMe: when it supports static prop initializers.
    static re64l = new RegExp('[0-9A-Za-z_~]', 'g');
    // $FlowFixMe: when it supports static prop initializers.
    static quants = ['/', '#', '!', '.'];
    // $FlowFixMe: when it supports static prop initializers.
    static rsTokExt = '^(=)(?:\\+(=))?$'.replace(/=/g, Spec.rT);
    // $FlowFixMe: when it supports static prop initializers.
    static reTokExt = new RegExp(Spec.rsTokExt);
    // $FlowFixMe: when it supports static prop initializers.
    static reTok = new RegExp('^'+Spec.rsTokExt+'$');
    // $FlowFixMe: when it supports static prop initializers.
    static rsQuant = "[/#\\.!\\*]";
    // $FlowFixMe: when it supports static prop initializers.
    static reQuant = new RegExp('^'+Spec.rsQuant+'$');
    // $FlowFixMe: when it supports static prop initializers.
    static rsQTokExt = '('+Spec.rsQuant+')((=)(?:\\+(=))?)'.replace(/=/g, Spec.rT);
    // $FlowFixMe: when it supports static prop initializers.
    static reQTokExt = new RegExp(Spec.rsQTokExt, 'g');
    // $FlowFixMe: when it supports static prop initializers.
    static reSpec = new RegExp('^(?:'+Spec.rsQTokExt+')*$');
    // $FlowFixMe: when it supports static prop initializers.
    static rsExt = '\\+(=)'.replace(/=/g, Spec.rT);
    // $FlowFixMe: when it supports static prop initializers.
    static reExt = new RegExp(Spec.rsExt, 'g');
}

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

