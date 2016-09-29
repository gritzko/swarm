'use strict';
let swarm = require('swarm-protocol');
let Syncable = require('./Syncable');
let Spec = swarm.Spec;
let Stamp = swarm.Stamp;
let Op = swarm.Op;

/** Flat LWW object: field values are either a string or a number or a reference. */
class LWWObject extends Syncable {

    /**
     * @param {Object} state - a {key: value} state for a new object
     */
    constructor (state) {
        super();
        this._values = Object.create(null);
        if (state)
            this.setAll(state);
    }

    /** @param {Object} obj - field-value map */
    setAll (obj) {
        Object.keys(obj).
            filter(key=>LWWObject.reFieldName.test(key)).
            sort().
            forEach(key => this.set(key, obj[key]));
    }

    set (name, value) {
        if (value===undefined)
            throw new Error('need a valid JSON value');
        if (!LWWObject.reFieldName.test(name))
            throw new Error('need a valid Base64x64 field name');
        this._submit(name, JSON.stringify(value));
    }

    get (name) {
        return this._values[name];
    }

    has (name) {
        return this._values.hasOwnProperty(name);
    }

    StampOf (name) {
        const at = this._state.at(name);
        return at===-1 ? Stamp.ZERO : this._state.ops[at].spec.Stamp;
    }

    stampOf (key) {
        return this.StampOf(key).toString();
    }

    get pojo () {
        return this._values;
    }

    _rebuild (op) {
        const name = op.spec.method;
        if (name===Op.METHOD_STATE) { // rebuild
            this._values = Object.create(null);
            this._state.ops.forEach(e=>{
                this._values[e.spec.method] = JSON.parse(e.value);
            });
        } else if (this._version < op.spec.stamp) {
            this._values[name] = JSON.parse(op.value);
        } else { // reorder
            this._values[name] = JSON.parse(this._state.get(name));
        }
    }

}
module.exports = LWWObject;

LWWObject.reFieldName = /^[a-zA-Z][A-Za-z_0-9]{0,9}$/;

LWWObject.id = 'LWWObject';
Syncable._classes[LWWObject.id] = LWWObject;


/**  reducer:  (string, op) -> new_string  */
class LWWObjectRDT extends Syncable.RDT {

    constructor (state) {
        super();
        this.ops = Op.parseFrame(state+'\n\n') || [];
    }

    at (name) {
        for(let i=0; i<this.ops.length; i++)
            if (this.ops[i].spec.method===name)
                return i;
        return -1;
    }

    apply (op) {
        const at = this.at(op.spec.method);
        if (at===-1)
            this.ops.push(op);
        else if (op.spec.Stamp.gt(this.ops[at].spec.Stamp))
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
