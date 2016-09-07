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
        let str;
        if (state===null)
            str = null;
        else if (state)
            str = LWWObject.obj2state(state);
        else
            str = '';
        super(str);
        this._values = this._values || Object.create(null);
    }

    set (name, value) {
        if (value===undefined) {
            Object.keys(name).
                filter(name=>LWWObject.reFieldName.test(name)).
                forEach(n => this.set(n, name[n]));
        } else if (name.constructor===String) {
            if (!LWWObject.reFieldName.test(name))
                throw new Error('invalid field name format');
            this._submit(name, LWWObject.val2str(value));
        } else {
            throw new Error('neither key-value nor map');
        }
    }

    get (name) {
        return this._values[name];
    }

    has (name) {
        return this._values.hasOwnProperty(name);
    }

    StampOf (key) {
        let vals = this._state.entries.filter(e => e.name===key);
        if (!vals.length) return null;
        let stamp = new Stamp(vals[0].stamp);
        if (stamp.isTranscendent() && !stamp.isZero() && !stamp.isAbnormal())
            return new Stamp(this._id);
        return stamp;
    }

    stampOf (key) {
        return this.StampOf(key).toString();
    }

    _rebuild (op) {
        if (op.name===Op.state || this._version>op.spec.stamp) { // rebuild
            this._values = Object.create(null);
            this._state.entries.forEach(e=>{
                this._values[e.name] = LWWObject.str2val(e.value);
            });
        } else { // adjust
            this._values[op.name] = LWWObject.str2val(op.value); // FIXME wrong :(((((
        }
    }

    static val2str (val) {
        /*if (typeof(val)==='number') {
            return '' + val;
        } else if (val._id) {
            return val.typeid;
        } else {
            return JSON.stringify(val.toString());
        }*/
        // TODO references
        return val!==undefined ? JSON.stringify(val) : '';
    }

    static str2val (str) {
        /*let first = str.charAt(0);
        switch (first) {
            case '"':
            case "'":
                return JSON.parse(str);
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
                return str.indexOf('.')===-1 ? parseInt(str) : parseFloat(str);
            case '/':
                return new Syncable.Ref(str);
            case '':
                return undefined;
            default:
                return undefined;
        }*/
        return str ? JSON.parse(str) : undefined;
    }

    /** to initialize the state with a map */
    static obj2state (vals) {
        let fields = Object.keys(vals)
            .filter(key=>LWWObject.reFieldName.test(key))
            .map(key => {
                return '!0000000001.'+key+'\t'+ LWWObject.val2str(vals[key]);
            });
        return fields.join('\n');
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
        let m = /^(\S+)\s*(.*)$/.exec(line);
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
        ).filter(
            e => LWWObject.reFieldName.test(e.name)
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
