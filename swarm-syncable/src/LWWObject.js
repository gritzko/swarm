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

    StampOf (key) {
        let vals = this._state.entries.filter(e => e.name===key).sort();
        if (!vals.length)
            return Stamp.ZERO;
        return new Stamp(vals.pop().stamp);
    }

    stampOf (key) {
        return this.StampOf(key).toString();
    }

    _rebuild (op) {
        if (op.spec.method===Op.METHOD_STATE || this._version>op.spec.stamp) { // rebuild
            this._values = Object.create(null);
            this._state.entries.forEach(e=>{
                this._values[e.name] = JSON.parse(e.value);
            });
        } else {
            this._values[op.name] = JSON.parse(op.value);
        }
    }

}
module.exports = LWWObject;
LWWObject.reFieldName = /^[a-zA-Z][A-Za-z_0-9]{0,9}$/;

LWWObject.id = 'LWWObject';
Syncable._classes[LWWObject.id] = LWWObject;


class LWWEntry {

    constructor (stamp, name, value) {
        this.stamp = stamp;
        this.name = name;
        this.value = value;
    }

    static fromString (line) {
        let m = /^\s*(\S+)\s*(.*)$/.exec(line);
        let spec = new Spec(m[1]);
        return new LWWEntry(spec.stamp, spec.name, m[2]);
    }

    toString() {
        return '!' + this.stamp + '.' + this.name +
            (this.value ? '\t' + this.value : '');
    }

}


/**  !stamp.field  JSON|/Type#ref|''  */
class LWWObjectRDT extends Syncable.RDT {

    constructor (state) {
        super();
        this.entries = !state ? [] : state.split('\n').map(
            str => LWWEntry.fromString(str)
        );
    }

    apply (op) {
        let entries = this.entries;
        let name = op.spec.name;
        let stamp = op.spec.stamp;
        let competes = entries.filter( e=> e.name===name );
        if (competes.every( e => e.stamp < stamp )) {
            entries = entries.filter( e=> e.name!==name );
            entries.push(new LWWEntry(stamp, name, op.value));
            this.entries = entries;
        }
    }

    toString () {
        return this.entries.join('\n');
    }


}
LWWObject.RDT = LWWObjectRDT;
