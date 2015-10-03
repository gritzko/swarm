"use strict";
var Op = require('./Op');
var Syncable = require('./Syncable');

// This most basic class is a key-value JavaScript-style object.
// It is also also an example of how to implement Syncables.
// Model's distributed/concurrent behavior is of a very classic
// Last-Write-Wins object where all changes are timestamped and
// the greater timestamp "wins" (LWW is a corner-case CRDT too).
// Note that changes are merged in the sense that a change may
// leave values untouched: !time1.set {x:1, y:1}, then
// !time2.set {y:2}, results in {x:1, y:2}.
function Model (values, owner) {
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
    Syncable.call(this, init_op, owner);
}
Model.prototype = Object.create( Syncable.prototype );
Model.prototype.constructor = Model;

// The API method for the .set op has the same name as the op, which is
// not always the case. It composes the op and submits it for execution.
Model.prototype.set = function (keys_values) {
    var bad = Object.keys(keys_values).some(function(key){
        return !Syncable.reFieldName.test(key);
    });
    if (bad) {
        throw new Error("malformed field name");
    }
    return this._owner.submit( this, 'set', JSON.stringify(keys_values) );
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



// The API exposes the outer state of a syncable. But, its
// inner state is its "true" state that also includes all
// the (CRDT) metadata. The outer state can always be generated
// from the inner state (see Syncable.rebuild()).
// This method is a constructor for the inner state.
// It either creates the default state or deserializes a .state
// op value.
function LWWObject (string) {
    // { stamp: {key:value} }
    var parsed = string ? JSON.parse(string) : {};
    var values = this.values = {};
    // some paranoid checks are very much relevant here
    var keys = Object.keys(parsed).filter(LWWObject.is_field_name);
    keys.forEach(function (key){
        var p = parsed[key];
        values[key] = new StampedValue(p.value, p.stamp);
    });
}
LWWObject.prototype = Object.create( Syncable.Inner.prototype );
LWWObject.prototype.constructor = LWWObject;
LWWObject.reFieldName = /^[a-z]\w*$/;
LWWObject.is_field_name = function (name) {
    return LWWObject.reFieldName.test(name);
};

function StampedValue (value, stamp) {
    this.value = value;
    this.stamp = stamp;
}

// This class implements just one kind of an op: set({key:value}).
// To implement your own ops you need to understand
// implications of partial order. Ops may be applied in slightly
// different orders at different replicas, but the result must
// converge. (see Model.playOpLog())
// An op is a method for an inner state object that consumes an
// op, changes inner state, no side effects allowed.
LWWObject.prototype.set = function (values, stamp) {
    var keys = Object.keys(values), self=this;
    keys = keys.filter(LWWObject.is_field_name);
    keys.forEach(function(key){
        var entry = self.values[key];
        if (entry===undefined || entry.stamp<stamp) {
            self.values[key] = new StampedValue(values[key], stamp);
        }
    });
};

LWWObject.prototype.write = function (op) {
    switch (op.op()) {
    case 'set': this.set(JSON.parse(op.value), op.stamp()); break;
    default:    throw new Error('operation unknown'); // FIXME
    }
};

// Produces the outer state from the inner state.
LWWObject.prototype.updateSyncable = function (syncable) {
    var values = this.values;
    Object.keys(values).forEach(function(k){
        syncable[k] = values[k].value;
    });
    var missing_keys = Object.keys(syncable).
        filter(LWWObject.is_field_name).
        filter(function(key) { !values.hasOwnProperty(key); });
    missing_keys.forEach(function(key){
        delete syncable[key];
    });
};

// Serializes the inner state to a string. The constructor must
// be able to parse this later.
LWWObject.prototype.toString = function () {
    return JSON.stringify(this.values);
};


Model.Inner = LWWObject;
Syncable.registerType('Model', Model);
module.exports = Model;
