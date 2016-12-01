"use strict";
var Base64x64 = require('./Base64x64');
var Id = require('./Id');

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
//  version id (see Id).
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
    constructor (id, type, stamp, location) {
        this._id = id ? Id.as(id) : Id.ZERO;
        this._type = type ? Id.as(type) : Id.ZERO;
        this._stamp = stamp ? Id.as(stamp) : Id.ZERO;
        this._loc = location ? Id.as(location) : Id.ZERO;
    }

    static fromString (str, defaults) {
        const def = defaults || Spec.ZERO;
        Spec.reSpec.lastIndex = 0;
        const m = Spec.reSpec.exec(str);
        if (!m) throw new Error('not a specifier');
        return new Spec(
            m[1]||def._id,
            m[2]||def._type,
            m[3]||def._stamp,
            m[4]||def._loc
        );
    }

    get Type () {
        return this._type;
    }

    get Id () {
        return this._id;
    }

    get Stamp () {
        return this._stamp;
    }

    get Location () {
        return this._loc;
    }

    get Loc () {
        return this.Location;
    }

    get type () {
        return this.Type.toString();
    }

    get id () {
        return this.Id.toString();
    }

    get stamp () {
        return this.Stamp.toString();
    }

    get location () {
        return this.Location.toString();
    }

    get loc () {
        return this.Location.toString();
    }

    get origin () {
        return this.Stamp.origin;
    }

    /** @deprecated */
    get typeid () {
        return this.object;
    }

    get typeName () {
        return this.Type.isNormal() ? undefined : this.Type.value;
    }

    get scope () {
        return this.Location.isAbnormal() ? this.Location.origin : undefined;
    }

    get eventName () {
        return this.Location.isNormal() ? undefined : this.Location.value;
    }

    get objectName () {
        return this.Id.isNormal() ? undefined : this.Id.value;
    }

    get author () {
        return this.Id.isNormal() ? this.Id.origin : undefined;
    }

    get birth () {
        return this.Id.isNormal() ? this.Id.value : undefined;
    }

    get time () {
        return this.Stamp.value;
    }

    get typeParameters () {
        return this.Type.isAbnormal() ? this.Type.origin : undefined;
    }

    isScoped () {
        return this.Location.isAbnormal() && !this.Location.isTranscendent();
    }

    get Object () {
        return new Spec(this.Id, this.Type, Id.ZERO, Id.ZERO);
    }

    get object () {
        return this.Object.toString(Spec.ZERO);
    }

    get Event () {
        return new Spec(Id.ZERO, Id.ZERO, this.Stamp, this.Location);
    }

    get event () {
        return this.Event.toString(Spec.ZERO);
    }

    get name () {
        return this.eventName;
    }

    toString (defaults) {
        const def = defaults || Spec.ZERO;
        var ret = '';
        if (!this.Id.eq(def.Id))
            ret += Spec.quants[0] + this.id;
        if (!this.Type.eq(def.Type))
            ret += Spec.quants[1] + this.type;
        if (!this.Stamp.eq(def.Stamp))
            ret += Spec.quants[2] + this.stamp;
        if (!this.Loc.eq(def.Loc) || !ret)
            ret += Spec.quants[3] + this.loc;
        return ret;
    }

    has (quant) {
        switch (quant) {
            case Spec.quants[0]:  return !this._id.isZero();
            case Spec.quants[1]:  return !this._type.isZero();
            case Spec.quants[2]:  return !this._stamp.isZero();
            case Spec.quants[3]:  return !this._loc.isZero();
            default: throw new Error('invalid quant');
        }
    }

    static is (str) {
        Spec.reSpec.lastIndex = 0;
        return Spec.reSpec.test(str.toString());
    }

    isSameObject (spec) {
        const s = Spec.as(spec);
        return this.Type.eq(s.Type) && this.Id.eq(s.Id);
    }

    isEmpty () {
        return this.Id.isZero() && this.Type.isZero() &&
            this.Stamp.isZero() && this.Location.isZero();
    }

    isOn () { return this.eventName === Spec.ON_OP_NAME; }

    isOff () { return this.eventName === Spec.OFF_OP_NAME; }

    isOnOff () {
        return this.isOn() || this.isOff();
    }

    isHandshake () {
        return this.isOnOff() && this.Type.value==='db'; // TODO constant
    }

    isMutation () {
        return ! Base64x64.isAbnormal(this.Location.value);
    }

    isState () {
        return this.eventName === Spec.STATE_OP_NAME;
    }

    isNoop () {
        return this.eventName === Spec.NOOP_OP_NAME;
    }

    isError () {
        return this.eventName === Spec.ERROR_OP_NAME;
    }

    isAbnormal () {
        return this.Location.isAbnormal();
    }

    isNormal () {
        return !this.isAbnormal();
    }

    static as (spec) {
        if (!spec) return Spec.ZERO;
        if (spec.constructor===Spec) return spec;
        if (spec.Id && spec.Type && spec.Stamp && spec.Loc) return spec;
        return Spec.fromString(spec.toString());
    }

}

Spec.quants = "#.@:";
Spec.rsSpec = Spec.quants.replace(/./g, '(?:\\$&('+Id.rsTok+'))?');
Spec.reSpec = new RegExp('^'+Spec.rsSpec+'$', 'g');
Spec.NON_SPECIFIC_NOOP = new Spec();
Spec.ZERO = new Spec();
Spec.ERROR = new Spec([Id.ERROR, Id.ERROR, Id.ERROR, Id.ERROR]);

Spec.ON_OP_NAME = "~on";
Spec.OFF_OP_NAME = "~off";
Spec.STATE_OP_NAME = "~state";
Spec.NOOP_OP_NAME = Base64x64.zero;
Spec.ERROR_OP_NAME = Base64x64.INCORRECT;
Spec.ON_STAMP = new Id(Spec.ON_OP_NAME);
Spec.OFF_STAMP = new Id(Spec.OFF_OP_NAME);
Spec.STATE_STAMP = new Id(Spec.STATE_OP_NAME);
Spec.NOOP_STAMP = new Id(Spec.NOOP_OP_NAME);
Spec.ERROR_STAMP = new Id(Spec.ERROR_OP_NAME);

module.exports = Spec;
