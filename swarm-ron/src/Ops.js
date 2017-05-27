"use strict";
const Base64x64 = require('./Base64x64');
const Id = require('./Id');
const Spec = require('./Spec');
const Op = require('./Op');
const Ids = require('./Ids');

/** immutable op array - same object ops only */
class Ops {

    constructor (id, type, stamps, locs, vals) {
        this._id = id;
        this._type = type;
        this._stamps = Ids.as(stamps);
        this._locs = Ids.as(locs);
        this._values = vals;
        this._string = null;
    }

    static fromOp (op) {
        const val = op.Value || {s:'',l:'',v:[]};
        return new Ops(op.Id, op.Type, val.s, val.l, val.v);
    }

    static fromOpArray (ops) {
        const stamps = ops.map( op => op.Stamp );
        const locs = ops.map( op => op.Loc );
        const vals = ops.map( op => op.Value );
        return new Ops(
            ops[0].Id,
            ops[0].Type,
            Ids.fromIdArray(stamps, '@'),
            Ids.fromIdArray(locs, ':'),
            vals
        );
    }

    get stamps () {
        return this._stamps;
    }

    get locations () {
        return this._locs;
    }

    get values () {
        return this._values;
    }

    splice (pos, remove, insert_ops) {
        const new_stamps = insert_ops.map( op => op.Stamp );
        const new_locs = insert_ops.map( op => op.Location );
        const new_vals = insert_ops.map( op => op.Value );
        const stamps = this._stamps.splice(pos, remove, new_stamps);
        const locs = this._locs.splice(pos, remove, new_locs);
        const values = this._values.slice(0, pos).concat(
            new_vals, this._values.slice(pos+remove) );
        return new Ops(this._id, this._type, stamps, locs, values);
    }

    iterator (context) {
        return new OpsIterator(this, context);
    }

    [Symbol.iterator]() {
        return this.iterator();
    }

    /** @return {Ops} */
    filter (fn) {

    }

    get length () {
        return this._stamps.length;
    }

    forEach (fn) {
        for(let op of this)
            fn(op);
    }
    
    /** get value by location */
    get (id) {
        const i = this.findLoc(id);
        return i===-1 ? undefined : this._values[i];
    }
    
    findLoc (loc_id) {
        return this._locs.find(loc_id);
    }
    
    findStamp () {
        
    }
    
    at (i) {
        return new Op(
            this._id,
            this._type,
            this._stamps.at(i),
            this._locs.at(i),
            this._values[i]
        );
    }

    toArray (context) {
        return Array.from(this.iterator(context));
    }

    toOp (spec) {
        return new Op( spec.Id, spec.Type, spec.Stamp, spec.Location, this.toJSON() );
    }

    toJSON () {
        return {
            s: this._stamps.toString(),
            l: this._locs.toString(),
            v: this._values
        };
    }

    toString () {
        if (this._string===null) {
            this._string = JSON.stringify(this.toJSON());
        }
        return this._string;
    }

}

class OpsIterator {

    constructor (ops) {
        this._ops = ops;
        this._op = null;
        this.stamps = ops._stamps.iterator();
        this.locs = ops._locs.iterator();
        this.vals = ops._values[Symbol.iterator]();
        this.nextOp();
    }

    get op () {
        return this._op;
    }

    get Stamp () {

    }

    get Location () {

    }

    get Value () {

    }

    to (new_offset) {
        while (!this.stamps.end && this.stamps.offset<new_offset)
            this.nextOp();    // FIXME leaps
    }

    next () {
        const ret = {
            value: this.op,
            done:  this.op===undefined
        };
        this.nextOp();
        return ret;
    }

    nextOp () {
        const stamp = this.stamps.nextId();
        if (!stamp)
            return this._op = undefined;
        const loc = this.locs.nextId();
        const val = this.vals.next().value;
        this._op = new Op(
            this._ops._id,
            this._ops._type,
            stamp,
            loc,
            val
        );
        return this._op;
    }

    get done () {
        return this.stamps.done;
    }

}

module.exports = Ops;