"use strict";
var Base64x64 = require('./Base64x64');
var Stamp = require('./Stamp');

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
//  version id (see Stamp).
//
//  A serialized specifier is a sequence of Base64 tokens each prefixed
//  with a "quant". A quant for a class name is '/', an object id is
//  prefixed with '#', a method with '.' and a version id with '!'.  A
//  special quant '+' separates parts of each token.  For example, a
//  typical version id looks like "!7AMTc+gritzko" which corresponds to
//  a version created on Tue Oct 22 2013 08:05:59 GMT by @gritzko.
//
//  A full serialized specifier looks like
//        /TodoItem#7AM0f+gritzko.done!7AMTc+gritzko
//  (a todo item created by @gritzko was marked 'done' by himself)
//
//  Specifiers are stored in strings, but we use a lightweight wrapper
//  class Spec to parse them easily. A Spec is immutable as we pass
//  specifiers around a lot.
class Spec {

    /** Constructor examples:
     * * new Spec(spec)
     * * new Spec("/Object#1CQKn+0r1g1n!0.on")
     * * new Spec(["Object", "1CQKn+0r1g1n", "0", "on"])
     * */
    constructor (spec, s2, s3, s4) {
        let t = this._toks = [Stamp.ZERO, Stamp.ZERO, Stamp.ZERO, Stamp.ZERO];
        if (!spec) {
            'nothing';
        } else if (spec.constructor===String) {
            Spec.reSpec.lastIndex = 0;
            let m = Spec.reSpec.exec(spec);
            if (m===null) {
                throw new Error("invalid spec");
            }
            for(let i=1; i<=4; i++) {
                if (m[i]!==null) {
                    t[i-1] = new Stamp(m[i]);
                }
            }
        } else if (spec.constructor===Spec) {
            this._toks = spec._toks;
        } else if (spec.constructor===Array && spec.length===4) {
            for (let i = 0; i < 4; i++) {
                var s = spec[i] || Stamp.ZERO;
                t[i] = s.constructor === Stamp ? s : new Stamp(s);
            }
        } else if (spec.constructor===Stamp) {
            t[0] = spec.constructor === Stamp ? spec : new Stamp(spec);
            t[1] = s2.constructor === Stamp ? s2 : new Stamp(s2);
            t[2] = s3.constructor === Stamp ? s3 : new Stamp(s3);
            t[3] = s4.constructor === Stamp ? s4 : new Stamp(s4);
        } else {
            throw new Error("unrecognized parameter");
        }
    }

    get type () {
        return this._toks[0].string;
    }

    get id () {
        return this._toks[1].string;
    }

    get stamp () {
        return this._toks[2].string;
    }

    get name () {
        return this._toks[3].string;
    }

    get Type () {
        return this._toks[0];
    }

    get Id () {
        return this._toks[1];
    }

    get Stamp () {
        return this._toks[2];
    }

    get Name () {
        return this._toks[3];
    }

    get origin () {
        return this.Stamp.origin;
    }

    get typeid () {
        let tispec = this.blank('/#');
        return tispec.toString(Spec.ZERO);
    }

    get scope () {
        return this.Name.origin;
    }

    get method () {
        return this.Name.value;
    }

    get author () {
        return this.Id.origin;
    }

    get birth () {
        return this.Id.value;
    }

    get time () {
        return this.Stamp.value;
    }

    get type_params () {
        return this.Type.origin;
    }

    get type_name () { // TODO rename
        return this.Type.value;
    }
    
    isScoped () {
        return this.scope !== Base64x64.ZERO;
    }

    static stampop (stamp, name) {
        return Spec.quants[2] + stamp + Spec.quants[3] + name;
    }

    get stampop () {
        return Spec.stampop(this._toks[2], this._toks[3]);
    }

    toString (defaults) {
        var ret = '';
        // if (defaults===undefined) {
        //     defaults = Spec.NON_SPECIFIC_NOOP;
        // }
        for(var i=0; i<4; i++) {
            if (defaults && this._toks[i]===defaults._toks[i] && (ret||i<3))
                continue;
            ret += Spec.quants[i] + this._toks[i].toString();
        }
        return ret;
    }

    /** replaces 0 tokens with values from the provided Spec */
    fill (spec) {
        var toks = this._toks.slice();
        var new_toks = spec.constructor===Spec ? spec._toks : spec;
        for(var i=0; i<4; i++) {
            if (toks[i].isZero()) {
                toks[i] = new_toks[i].constructor===Stamp ?
                    new_toks[i] : new Stamp(new_toks[i]);
            }
        }
        return new Spec(toks);
    }

    blank (except) {
        if (!except) {
            except = '';
        }
        var toks = this._toks.slice();
        for(var i=0; i<4; i++) {
            if (except.indexOf(Spec.quants[i])===-1) {
                toks[i] = Stamp.ZERO;
            }
        }
        return new Spec(toks);
    }

    has (quant) {
        let i = Spec.quants.indexOf(quant);
        if (i===-1) { throw new Error("invalid quant"); }
        return !this._toks[i].isZero();
    }

    static is (str) {
        Spec.reSpec.lastIndex = 0;
        return Spec.reSpec.test(str.toString());
    }

    isSameObject (spec) {
        if (spec.constructor!==Spec) {
            spec = new Spec(spec);
        }
        return this.Type.eq(spec.Type) && this.Id.eq(spec.Id);
    }

    isEmpty () {
        return this._toks.every(t => t.isEmpty());
    }

    restamp (stamp, origin) {
        if (origin) stamp = new Stamp(stamp, origin);
        return new Spec([this.Type, this.Id, stamp, this.Name]);
    }

    rename (stamp, origin) {
        if (origin) stamp = new Stamp(stamp, origin);
        return new Spec([this.Type, this.Id, this.Stamp, stamp]);
    }

    /** @param {String|Base64x64} method */
    remethod (method) {
        return new Spec([this.Type, this.Id, this.Stamp, new Stamp(method, this.scope)]);
    }

    /** @param {String|Base64x64} scope */
    scoped (scope) {
        return new Spec([this.Type, this.Id, this.Stamp, new Stamp(this.method, scope)]);
    }

}

Spec.quants = ['/', '#', '!', '.'];
Spec.rsSpec = '/#!.'.replace(/./g, '(?:\\$&('+Stamp.rsTok+'))?');
Spec.reSpec = new RegExp('^'+Spec.rsSpec+'$', 'g');
Spec.NON_SPECIFIC_NOOP = new Spec();
Spec.ZERO = new Spec();
Spec.ERROR = new Spec([Stamp.ERROR, Stamp.ERROR, Stamp.ERROR, Stamp.ERROR]);

module.exports = Spec;