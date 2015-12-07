"use strict";
var stamp = require('swarm-stamp');
var LamportTimestamp = stamp.LamportTimestamp;
var Spec = require('./Spec');
var Op = require('./Op');
var Syncable = require('./Syncable');

// Backbone's Collection is essentially an array. Arrays behave poorly
// under concurrent writes and it is expensive to make them behave good.
// Hence, our primary collection type is an unordered Set. One may obtain
// an array by sorting entries (see sort()).
// Note that a Set can only contain Syncable objects (no primitives,
// no arbitrary JSON).
function Set (init_set, owner) {
    // { id: object }
    this.objects = Object.create(null);
    Syncable.call(this, null, owner);
}
Set.prototype = Object.create( Syncable.prototype );
Set.prototype.constructor = Set;


Set.prototype.isEmpty = function () {
    return this.size() === 0;
};


Set.prototype.size = function () {
    return Object.keys(this.objects).length;
};


Set.prototype.onObjectChange = function (ev) {
    this.emit('in:change', {
        name: "change",
        object: ev.target,
        id: ev.target._id,
        event: ev,
        target: this
    });
};

// Return a sorted array (unless `sort_fn` is specified, sort on object ids)
Set.prototype.toArray = function (sort_fn) {
    var objects = this.objects;
    var ids = Object.keys(objects);
    var ret = ids.map(function(id){ return objects[id]; });
    sort_fn = sort_fn || function id_sort (a, b) {
        if (a._id<b._id) { return -1; }
        else if (a._id>b.id) { return 1; }
        else { return 0; }
    };
    ret.sort(sort_fn);
    return ret;
};


// Public API: Adds an object to the set.
Set.prototype.addSpec = function (arg) {
    var typeId = new Spec(arg).filter('/#');
    if (!typeId.type() || ! typeId.id()) {
        throw new Error('invalid argument');
    }
    return this._owner.submit( this, 'add', typeId.toString() );
};


Set.prototype.add = function (syncable) {
    if (!syncable._type) {
        throw new Error('not a syncable');
    }
    return this.addSpec(syncable.typeId());
};

Set.prototype.addId = function (id) {
    if (!LamportTimestamp.is(id)) {
        throw new Error('not an id');
    }
    return this.addSpec(new Spec('#'+id, Syncable.DEFAULT_TYPE).typeId());
};


Set.prototype.addAll = function (list) {
    var self = this;
    list.forEach(function(e){ self.add(e); });
};


Set.prototype.removeSpec = function (typeId) {
    var story = this._story || {}, typeid = typeId.toString();
    var rm = Object.keys(story).filter(function(stamp) {
        return story[stamp]===typeid;
    });
    rm.length && this._owner.submit(this, 'rm', rm.join());
};

// only for instances of Model
Set.prototype.removeId = function (id) {
    if (!LamportTimestamp.is(id)) {
        throw new Error('not an id');
    }
    return this.removeSpec(new Spec('#'+id, Syncable.DEFAULT_TYPE).typeId());
};


Set.prototype.remove = function (syncable) {
    if (!syncable._type) {
        throw new Error('not a syncable');
    }
    return this.removeSpec(syncable.typeId());
};


Set.prototype.contains = function (syncable) {
    if (!syncable._type) {
        throw new Error('not a syncable');
    }
    return this.containsSpec(syncable.typeId());
};


Set.prototype.containsSpec = function (typeid) {
    return typeid in this.objects;
};


Set.prototype.containsId = function (id) {
    return this.containsSpec(new Spec('#'+id, Syncable.DEFAULT_TYPE).typeId());
};


Set.prototype.containsAll = function (array) {
    var self = this;
    return array.every(function(val){
        return self.contains(val);
    });
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
    var stamps = value_stamp.split(','), added = this.added;
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
