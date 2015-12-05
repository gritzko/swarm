"use strict";
var stamp = require('swarm-stamp');
var LamportTimestamp = stamp.LamportTimestamp;
var Spec = require('./Spec');
var Op = require('./Op');
var Syncable = require('./Syncable');

// Backbone's Collection is essentially an array and arrays behave poorly
// under concurrent writes (see OT). Hence, our primary object collection
// type is an unordered Set. One may obtain a linearized version by sorting
// entries by keys or otherwise (see sort()).
function Set (init_set, owner) {
    // { id: object }
    this.objects = {};
    Syncable.call(this, null, owner);
}


Set.prototype.onObjectChange = function (ev) {
    this.emit('in:change', {
        name: "change",
        object: ev.target,
        id: ev.target._id,
        event: ev,
        target: this
    });
};

Set.prototype.sorted = function (criteria) {
    var ret = [];
};

// Public API: Adds an object to the set.
Set.prototype.add = function (syncable) {
    return this._owner.submit( this, 'add', syncable.spec() );
};


Set.prototype.remove = function (syncable) {
    var typeid = syncable.typeid(), story = this._story;
    var rm = Object.keys(story).filter(function(stamp) {
        return story[stamp]===typeid;
    });
    rm.length && this.submit('rm', rm.join());
};


Set.prototype.contains = function (param) {
    var typeid = param._type ? param.typeid() : new Spec(param).typeid();
    return typeid in this.objects;
};

// TODO port & test those I
//                        V

Set.prototype.get = function (key_spec) {
    key_spec = new Spec(key_spec).filter('/#');
    if (key_spec.pattern() !== '/#') {
        throw new Error("invalid spec");
    }
    return this.objects[key_spec];
};

Set.prototype.list = function (order) {
    var ret = [];
    for (var key in this.objects) {
        ret.push(this.objects[key]);
    }
    ret.sort(order);
    return ret;
};

Set.prototype.forEach = function (cb, thisArg) {
    var index = 0;
    for (var spec in this.objects) {
        cb.call(thisArg, this.objects[spec], index++);
    }
};

Set.prototype.every = function (cb, thisArg) {
    var index = 0;
    for (var spec in this.objects) {
        if (!cb.call(thisArg, this.objects[spec], index++)) {
            return false;
        }
    }
    return true;
};

Set.prototype.filter = function (cb, thisArg) {
    var res = [];
    this.forEach(function (entry, idx) {
        if (cb.call(thisArg, entry, idx)) {
            res.push(entry);
        }
    });
    return res;
};



// An OR-Set implemented with Lamport timestamps
function ORSet (state_string) {
    // added ids, {stamp: id}
    var added = this.added = Object.create(null);
    if (state_string) {
        var parsed = JSON.parse(state_string);
        var stamps = Object.keys(parsed).filter(LamportTimestamp.is);
        stamps.forEach(function (stamp) {
            var spec = new Spec(parsed[stamp], null, just_model);
            added[stamp] = spec.typeid();
        });
    }
}
var just_model = new Spec('/Model');


ORSet.prototype.add = function (value, stamp) {
    var spec = new Spec(value,null,just_model);
    this.added[stamp] = spec.typeid();
};


ORSet.prototype.remove = function (value_stamp) {
    var stamps = value_stamp.split(), added = this.added;
    stamps.forEach(function(stamp){
        delete added[stamp];
    });
};


ORSet.prototype.toString = function () {
    // TODO abbrev  -/Model
    return JSON.stringify(this.added);
};


ORSet.prototype.write = function (op) {
    switch (op.op()) {
    case 'add': this.add(op.value, op.stamp()); break;
    case 'rm':  this.remove(op.value); break;
    default:    throw new Error('operation unknown'); // FIXME
    }
};


ORSet.prototype.updateSyncable = function (syncable) {
    var objects = Object.create(null), old_objects = syncable.objects;
    var added = this.added, owner = syncable._owner;
    var lstn = syncable.onObjectChange;
    Object.keys(added).forEach(function(stamp){
        var typeid = added[stamp];
        var object = old_objects[typeid];
        if (object) {
            delete old_objects[typeid];
        } else {
            object = owner.get(typeid);
            // subscribe to member object changes
            object.on('change', lstn, syncable);
        }
        objects[typeid] = object;
    });
    syncable.objects = objects;
    syncable._story = added;
    Object.keys(old_objects).forEach(function(typeid){
        var removed = old_objects[typeid];
        removed.off('change', lstn, syncable);
    });
};


Set.Inner = ORSet;
Syncable.registerType('Set', Set);
module.exports = Set;
