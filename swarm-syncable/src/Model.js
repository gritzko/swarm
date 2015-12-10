/**
 * This most basic class is a key-value JavaScript-style object.
 * It is also also an example of how to implement Syncables.
 * Model's distributed/concurrent behavior is of a very classic
 * Last-Write-Wins object where all changes are timestamped and
 * the greater timestamp "wins" (LWW is a corner-case CRDT too).
 * Note that changes are merged in the sense that a change may
 * leave values untouched: !time1.set {x:1, y:1}, then
 * !time2.set {y:2}, results in {x:1, y:2}.
 */
'use strict';

import {LamportTimestamp} from 'swarm-stamp';
import Op from './Op';
import Syncable from './Syncable';

export default class Model extends Syncable {

    constructor(values, owner) {
        var init_op = null;
        if (values) {
            var bad_keys = Object.keys(values).some(function(key){
                return !Syncable.reFieldName.test(key);
            });
            if (bad_keys) {
                throw new Error('invalid keys');
            }
            init_op = new Op('.set', JSON.stringify(values)); // TODO 1.0 refs
        }
        // _owner _id _events
        super(init_op, owner, false);
        this.adopt(init_op, owner);
    }

    /**
     * The API method for the .set op has the same name as the op, which is
     * not always the case. It composes the op and submits it for execution.
     */
    set(keys_values) {
        var bad = Object.keys(keys_values).some(function(key){
            return !Syncable.reFieldName.test(key);
        });
        for(var key in keys_values) {
            var val = keys_values[key];  // FIXME ugly
            if (val._type) {
                keys_values[key] = {ref: val.typeid()};
            }
        }
        if (bad) {
            throw new Error("malformed field name");
        }
        return this._owner.submit( this, 'set', JSON.stringify(keys_values) );
    }


    /**
     * The API user may directly modify the outer state and invoke save(),
     * which converts de-facto changes into proper ops. ops change the
     * inner state, the outer state gets regenerated, ops propagate
     * to other replicas.
     */
    save(inner) {
        var dirty = this.toPojo();
        var dirty_keys = this.keys();
        this.rebuild(this.getInnerState());
        var clean_keys = this.keys();
        var all_keys = dirty_keys.concat(clean_keys);
        var changes = {}, changed = false;
        // compare de-facto "dirty" values to the last version's values
        for(var i=0; i<all_keys.length; i++) {
            var key = all_keys[i];
            if (key.charAt(0)==='_') {continue;}
            if (Syncable.toPojo(this[key])!==dirty[key]) { // FIXME nesteds, deep compare
                // a change detected
                changes[key] = dirty[key]; // FIXME flatten
                changed = true;
            }
        }
        // finally, commit the changes
        changed && this.set(changes);
    }

    /**
     * A bit of syntactic sugar for Model listeners.
     * Invoke model.onFieldChange('field', cb) to listen to that particular field.
     */
    onFieldChange(field, callback, context) {
        /*if (filter.constructor===Function) {  ?
            context = callback;
            callback = filter;
            filter = null;
        }*/
        var filter = function (ev) {
            return field in ev.value;
        };
        Syncable.prototype.on.call(this, filter, callback, context);
    }

    keys() {
        return Object.keys(this).filter(function(key){
            return Syncable.reFieldName.test(key);
        });
    }

    toString() {
        return JSON.stringify(this, this.keys());
    }
}


/**
 * The API exposes the outer state of a syncable. But, its inner state is its
 * "true" state that also includes all the (CRDT) metadata. The outer state can
 * always be generated from the inner state (see Syncable.rebuild()).  This
 * method is a constructor for the inner state.  It either creates the default
 * state or deserializes a .state op value.
 */
class LWWObject extends Syncable.Inner {

    constructor(string) {
        super();
        // { stamp: {key:value} }
        this._version = null;
        var parsed = string ? JSON.parse(string) : {};
        var values = this.values = Object.create(null);
        // some paranoid checks are very much relevant here
        var stamps = Object.keys(parsed).filter(LamportTimestamp.is).sort();
        stamps.forEach(function (stamp){ // invert wire-format into mem-format
            var set = parsed[stamp];
            var keys=Object.keys(set).filter(LWWObject.is_field_name);
            keys.forEach(function(key) {
                values[key] = new StampedValue(set[key], stamp);
            });
        });
    }

    /**
     * This class implements just one kind of an op: set({key:value}).  To
     * implement your own ops you need to understand implications of partial
     * order. Ops may be applied in slightly different orders at different
     * replicas, but the result must converge. (see Model.playOpLog()) An op is
     * a method for an inner state object that consumes an op, changes inner
     * state, no side effects allowed.
     */
    set(values, stamp) {
        var keys = Object.keys(values), self=this;
        keys = keys.filter(LWWObject.is_field_name);
        keys.forEach(function(key){
            var entry = self.values[key];
            if (entry===undefined || entry.stamp<stamp) {
                self.values[key] = new StampedValue(values[key], stamp);
            }
        });
    }

    write(op) {
        switch (op.op()) {
        case 'set': this.set(JSON.parse(op.value), op.stamp()); break;
        default:    throw new Error('operation unknown'); // FIXME
        }
    };

    /**
     * Produces the outer state from the inner state.
     */
    updateSyncable(syncable) {
        var values = this.values;
        Object.keys(values).forEach(function(k){
            var val = values[k].value;
            if (val.constructor===Object && val.ref) {
                val = syncable._owner.get(val.ref); // FIXME ugly
            }
            syncable[k] = val;
        });
        var missing_keys = Object.keys(syncable).
            filter(LWWObject.is_field_name).
            filter(function(key) { !(key in values); });
        missing_keys.forEach(function(key){
            delete syncable[key];
        });
    }

    /**
     * Serializes the inner state to a string. The constructor must
     * be able to parse this later.
     */
    toString() {
        var wire = Object.create(null), values = this.values;
        var keys = Object.keys(this.values);
        keys.forEach(function(key){
            var entry = values[key], change = wire[entry.stamp];
            if (!change) {
                change = wire[entry.stamp] = Object.create(null);
            }
            change[key] = entry.value;
        });
        return JSON.stringify(wire);
    }
}

function StampedValue (value, stamp) {
    this.value = value;
    this.stamp = stamp;
}

LWWObject.reFieldName = /^[a-z]\w*$/;
LWWObject.is_field_name = function (name) {
    return LWWObject.reFieldName.test(name);
};

Model.Inner = LWWObject;
Syncable.registerType('Model', Model);
