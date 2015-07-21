"use strict";
var Spec = require('./Spec');
var Syncable = require('./Syncable');

// This most basic class is a key-value JavaScript-style object.
// It is also also an example of how to implement Syncables.
// Model's distributed/concurrent behavior is of a very classic
// Last-Write-Wins object where all changes are timestamped and
// the greater timestamp "wins" (LWW is a corner-case CRDT too).
// Note that changes are merged in the sense that a change may
// leave values untouched: !time1.set {x:1, y:1}, then
// !time2.set {y:2}, results in {x:1, y:2}.
function Model (id_or_value, owner) {
    var id = null;
    if (id_or_value && id_or_value.constructor===String) {
        if (!Spec.reTok.test(id_or_value)) {
            throw new Error("invalid id");
        }
        id = id_or_value;
    } else {
        var values = id_or_value;
        for(var key in values) {
            if (Syncable.reFieldName.test(key)) {
                this[key] = values[key]; // TODO flatten
            }
        }
    }
    // _owner _id _events
    Syncable.call(this, id, owner);
}
Model.prototype = Object.create( Syncable.prototype );
Model.prototype.constructor = Model;

// The API method for the .set op has the same name as the op, which is
// not always the case. It composes the op and submits it for execution.
Model.prototype.set = function (keys_values) {
    var pojo_kv = Syncable.toPojo(keys_values);
    for (var key in pojo_kv) {
        if (!Syncable.reFieldName.test(key)) {
            throw new Error("malformed field name: "+key);
        }
    }
    return this._owner.submit( this, 'set', JSON.stringify(pojo_kv) );
};

// Produces the outer state from the inner state.
// Must have no side effects, as a pure function, in a sense.
Model.prototype.rebuild = function (inner) {
    Syncable.prototype.rebuild.call(this, inner); // _id, _version...
    if (!inner) { return; }
    var changes = Model.playOpLog(inner.oplog);
    for(var k in changes) {
        this[k] = changes[k]; // TODO partial
    }
    for (k in this) {
        if (Syncable.reFieldName.test(k) && !(k in changes)) {
            delete this[k];
        }
    }
};

// The API user may directly modify the outer state and invoke save(),
// which converts de-facto changes into proper ops. ops change the
// inner state, the outer state gets regenerated, ops propagate
// to other replicas.
Model.prototype.save = function (inner) {
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
};

// A bit of syntactic sugar for Model listeners.
// Invoke model.onFieldChange('field', cb) to listen to that particular field.
Model.prototype.onFieldChange = function (field, callback, context) {
    /*if (filter.constructor===Function) {  ?
        context = callback;
        callback = filter;
        filter = null;
    }*/
    var filter = function (ev) {
        return field in ev.value;
    };
    Syncable.prototype.on.call(this, filter, callback, context);
};

Model.prototype.keys = function () {
    return Object.keys(this).filter(function(key){
        return Syncable.reFieldName.test(key);
    });
};

Model.prototype.toPojo = function () {
    var keys = this.keys(), pojo = {}, self=this;
    keys.forEach(function(key){
        pojo[key]=Syncable.toPojo(self[key]);
    });
    return pojo;
};


// The API exposes the outer state of a syncable. But, its
// inner state is its "true" state that also includes all
// the (CRDT) metadata. The outer state can always be generated
// from the inner state (see Syncable.rebuild()).
// Inner state travels on the wire, gets saved into the DB, etc.
// This method is a constructor for the inner state.
// It either creates the default state or deserializes a .state
// op value.
function InnerModel (op, owner) {
    Syncable.Inner.call(this, op, owner);
    // { stamp: {key:value} }
    var parsed = op.value ? JSON.parse(op.value) : {};
    // some paranoid checks are very much relevant here
    var stamps = Object.keys(parsed);
    var correct = stamps.every(function(stamp){
        return Spec.reTokExt.test(stamp);
    });
    if (!correct) {
        throw new Error('invalid state');
    }
    this.oplog = parsed;
}
InnerModel.prototype = Object.create( Syncable.Inner.prototype );
InnerModel.prototype.constructor = InnerModel;

// This class implements just one kind of an op: set({key:value}).
// To implement your own ops you need to understand
// implications of partial order. Ops may be applied in slightly
// different orders at different replicas, but the result must
// converge. (see Model.playOpLog())
// An op is a method for an inner state object that consumes an
// op, changes inner state, no side effects allowed.
InnerModel.prototype.set = function (op) {
    var stamp = op.stamp();
    var values = JSON.parse(op.value);

    this.oplog[stamp] = values;
    //var new_vals = Model.playOpLog (this.oplog, stamp);

    return {
        name: "set",
        value: values, //new_vals,
        spec: op.spec,
        target: null,
        old_version: this._version
    };
};

InnerModel.prototype.dispatch = function (op) {
    switch (op.op()) {
    case 'set': return this.set(op);
    default:    throw new Error('operation unknown');
    }
};

// Serializes the inner state to a string. The constructor must
// be able to parse this later.
InnerModel.prototype.toString = function () {
    return JSON.stringify(this.oplog);
};


Model.Inner = InnerModel;
Syncable.registerType('Model', Model);
module.exports = Model;


// Model's inner state is a compact form of its op log. Any overwritten
// ops are removed, so the number of records can not exceed the number
// of fields.
// This method replays the oplog, compacts it as it goes and produces the
// outer state (returned) from the inner state (supplied as a parameter).
// As an optional twist, this implementation may return changes
// incurred by a single op.
Model.playOpLog = function (oplog, break_at) {
    var stamps = Object.keys(oplog);
    stamps.sort();
    var changes = {};
    for(var i=stamps.length-1; i>=0; i--) {
        var stamp = stamps[i], values = oplog[stamp], empty = true;
        for (var key in values) {
            if (key in changes) { // this key was overwritten
                delete values[key];
            } else {
                empty = false;
                changes[key] = values[key];
            }
        }
        if (empty) { // log compaction; no need to keep that anymore
            delete oplog[stamp];
        }
        if (break_at) {
            if (break_at===stamp) {
                break;
            } else {
                for(var k in changes) {changes[k]=undefined;}
            }
        }
    }
    return changes;
};
