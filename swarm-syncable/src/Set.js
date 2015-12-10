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
class Set extends Syncable {

  constructor(init_set, owner) {
      super(null, owner, false);
      this.objects = Object.create(null);
      this.adopt(null, owner);
      // { id: object }
  }

  isEmpty() {
      return this.size() === 0;
  }

  size() {
      return Object.keys(this.objects).length;
  }

  onObjectChange(ev) {
      this.emit('in:change', {
          name: "change",
          object: ev.target,
          id: ev.target._id,
          event: ev,
          target: this
      });
  }

  // Return a sorted array (unless `sort_fn` is specified, sort on object ids)
  toArray(sort_fn) {
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
  }

  // Public API: Adds an object to the set.
  addSpec(arg) {
      var typeId = new Spec(arg).filter('/#');
      if (!typeId.type() || ! typeId.id()) {
          throw new Error('invalid argument');
      }
      return this._owner.submit( this, 'add', typeId.toString() );
  }

  add(syncable) {
      if (!syncable._type) {
          throw new Error('not a syncable');
      }
      return this.addSpec(syncable.typeId());
  }

  addId(id) {
      if (!LamportTimestamp.is(id)) {
          throw new Error('not an id');
      }
      return this.addSpec(new Spec('#'+id, Syncable.DEFAULT_TYPE).typeId());
  }


  addAll(list) {
      var self = this;
      list.forEach(function(e){ self.add(e); });
  }

  removeSpec(typeId) {
      var story = this._story || {}, typeid = typeId.toString();
      var rm = Object.keys(story).filter(function(stamp) {
          return story[stamp]===typeid;
      });
      rm.length && this._owner.submit(this, 'rm', rm.join());
  }

  // only for instances of Model
  removeId(id) {
      if (!LamportTimestamp.is(id)) {
          throw new Error('not an id');
      }
      return this.removeSpec(new Spec('#'+id, Syncable.DEFAULT_TYPE).typeId());
  }

  remove(syncable) {
      if (!syncable._type) {
          throw new Error('not a syncable');
      }
      return this.removeSpec(syncable.typeId());
  }

  contains(syncable) {
      if (!syncable._type) {
          throw new Error('not a syncable');
      }
      return this.containsSpec(syncable.typeId());
  }

  containsSpec(typeid) {
      return typeid in this.objects;
  }

  containsId(id) {
      return this.containsSpec(new Spec('#'+id, Syncable.DEFAULT_TYPE).typeId());
  }

  containsAll(array) {
      var self = this;
      return array.every(function(val){
          return self.contains(val);
      });
  }

  // TODO port & test those I
  //                        V

  get(key_spec) {
      key_spec = new Spec(key_spec).filter('/#');
      if (key_spec.pattern() !== '/#') {
          throw new Error("invalid spec");
      }
      return this.objects[key_spec];
  }

  list(order) {
      var ret = [];
      for (var key in this.objects) {
          ret.push(this.objects[key]);
      }
      ret.sort(order);
      return ret;
  }

  forEach(cb, thisArg) {
      var index = 0;
      for (var spec in this.objects) {
          cb.call(thisArg, this.objects[spec], index++);
      }
  }

  every(cb, thisArg) {
      var index = 0;
      for (var spec in this.objects) {
          if (!cb.call(thisArg, this.objects[spec], index++)) {
              return false;
          }
      }
      return true;
  }

  filter(cb, thisArg) {
      var res = [];
      this.forEach(function (entry, idx) {
          if (cb.call(thisArg, entry, idx)) {
              res.push(entry);
          }
      });
      return res;
  }
}

var just_model = new Spec('/Model');

// An OR-Set implemented with Lamport timestamps
class ORSet {

    constructor(state_string) {
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

    add(value, stamp) {
        var spec = new Spec(value,null,just_model);
        this.added[stamp] = spec.typeid();
    }

    remove(value_stamp) {
        var stamps = value_stamp.split(','), added = this.added;
        stamps.forEach(function(stamp){
            delete added[stamp];
        });
    }

    toString() {
        // TODO abbrev  -/Model
        return JSON.stringify(this.added);
    }

    write(op) {
        switch (op.op()) {
        case 'add': this.add(op.value, op.stamp()); break;
        case 'rm':  this.remove(op.value); break;
        default:    throw new Error('operation unknown'); // FIXME
        }
    }

    updateSyncable(syncable) {
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
    }
}

Set.Inner = ORSet;
Syncable.registerType('Set', Set);
module.exports = Set;
