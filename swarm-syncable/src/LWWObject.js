'use strict';
let swarm = require('swarm-protocol');
let Syncable = require('./Syncable');
let Spec = swarm.Spec;
let Stamp = swarm.Stamp;
let Op = swarm.Op;

/** Flat LWW object: field values are either a string or a number or a reference. */
class LWWObject extends Syncable {

    static normalize_start_state (something, stamp) {
        // return a string
    }

    /** @param {Object} obj - field-value map */
    setAll (obj) {
        Object.keys(obj).
            filter(key=>LWWObject.reFieldName.test(key)).
            sort().
            forEach(key => this.set(key, obj[key]));
    }

    static _init_state (obj, stamp, clock) {
        let ret =  Object.keys(obj).filter(key=>LWWObject.reFieldName.test(key)).
        sort().map( key =>
                new Spec([Stamp.ZERO, Stamp.ZERO, clock.issueTimestamp(), key]).event +
                '\t' +
                JSON.stringify(obj[key])
        );
        return ret.join('\n');
    }

    set (name, value) {
        if (value===undefined)
            throw new Error('need a valid JSON value');
        if (!LWWObject.reFieldName.test(name))
            throw new Error('need a valid Base64x64 field name');
        this._offer(name, JSON.stringify(value));
    }

    get (name) {
        return this._values[name];
    }

    has (name) {
        return this._values.hasOwnProperty(name);
    }

    StampOf (name) {
        const at = this._rdt.at(name);
        return at===-1 ? Stamp.ZERO : this._rdt.ops[at].Stamp;
    }

    stampOf (key) {
        return this.StampOf(key).toString();
    }

    get pojo () {
        return this._values;
    }

    save () {
        // TODO
    }

    _rebuild (op) {
        const name = op ? op.method : Op.METHOD_STATE; // :(
        if (name===Op.METHOD_STATE) { // rebuild
            this._values = Object.create(null);
            this._rdt.ops.forEach(e=>{
                this._values[e.method] = JSON.parse(e.value);
            });
        } else if (this._version < op.stamp) {
            this._values[name] = JSON.parse(op.value);
        } else { // reorder
            const value = this._rdt.get(name);
            if (value===undefined)
                delete this._values[name];
            else
                this._values[name] = JSON.parse(value);
        }
    }

}
module.exports = LWWObject;

LWWObject.reFieldName = /^[a-zA-Z][A-Za-z_0-9]{0,9}$/;

/**  reducer:  (string, op) -> new_string  */
class LWWObjectRDT extends Syncable.RDT {

    constructor (state, host) {
        super(state, host);
        this.ops = this.ops || [];
    }

    reset (state_op) {
        this.ops = Op.parseFrame(state_op.value+'\n\n') || [];
    }

    at (name) {
        for(let i=0; i<this.ops.length; i++)
            if (this.ops[i].method===name)
                return i;
        return -1;
    }

    _apply (op) {
        switch (op.method) { // FIXME ugly
            case Op.METHOD_NOOP:
            case Op.METHOD_ON:
            case Op.METHOD_OFF:
            case Op.METHOD_STATE:
            case Op.METHOD_ERROR:
                break;
            default:
                this._set(op);
        }
        super._apply(op);
    }

    _set (op) {
        op = new Op(op.Event, op.value);
        const at = this.at(op.method);
        if (at===-1)
            this.ops.push(op);
        else if (op.Stamp.gt(this.ops[at].Stamp))
            this.ops[at] = op;
    }

    get (name) {
        const at = this.at(name);
        return at===-1 ? undefined : this.ops[at].value;
    }

    toString () {
        if (this.ops.length===0) return '';
        const frame = Op.serializeFrame(this.ops, Spec.ZERO);
        return frame.substring(0, frame.length-2);
    }


}
LWWObject.RDT = LWWObjectRDT;
LWWObjectRDT.Class = 'LWWObject';
Syncable.addClass(LWWObject);
