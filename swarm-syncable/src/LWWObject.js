'use strict';
let swarm = require('swarm-protocol');
let Syncable = require('./Syncable');
let Spec = swarm.Spec;
let Stamp = swarm.Stamp; 

class LWWObject extends Syncable {

    constructor (spec_id_op_nothing, host) {
        super(spec_id_op_nothing, host);
    }

    set (name, value) {
        if (!Stamp.is(name))
            throw new Error('invalid field name format');
        this._submit(name, JSON.stringify(value));
    }

}
module.exports = LWWObject;


class ObjectRDT extends Syncable._rdt {

    constructor (state_op) {
        super();
        this.state = JSON.parse(state_op.value);
        this.stamps = Object.create(null);
        Object.keys(this.state).forEach(spec_str => {
            let spec = new Spec(spec_str);
            this.stamps[spec.name] = spec.stamp;
        });
    }

    apply (op) {
        if (op.name!=='set') return;
        try {
            var json = JSON.parse(op.value);
        } catch (ex) {
            console.error("invalid JSON value!!!", op);
            return;
        }
        let name = op.spec.name;
        let stamp = op.spec.stamp;
        let oldstamp = this.stamps[name];
        if (oldstamp) {
            if (oldstamp>stamp)
                return; // concurrent write wins
            this.state[op.spec.stampop] = json;
            let oldspec = new Spec([Stamp.ZERO,Stamp.ZERO,oldstamp,name]);
            delete this.state[oldspec.stampop];
            this.stamps[name] = stamp;
        }
        this.stamps[name] = stamp;
    }

    get (name) {
        let stamp = this.stamps[name];
        if (!stamp)
            return null;
        else
            return this.state[ Spec.stampop(stamp, name) ];
    }

    toString () {
        return JSON.stringify(this.state);
    }

}
LWWObject._rdt = ObjectRDT;