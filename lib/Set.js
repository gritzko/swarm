"use strict";

var Spec = require('./Spec');
var Op = require('./Op');
var Syncable = require('./Syncable');

/**
 * Backbone's Collection is essentially an array and arrays behave poorly
 * under concurrent writes (see OT). Hence, our primary collection type
 * is a {id:Model} Set. One may obtain a linearized version by sorting
 * them by keys or otherwise.
 * This basic Set implementation can only store objects of the same type.
 * @constructor
 */
// FIXME
function Set (id, owner) {
    // { id: object }
    this.objects = {};
    this.onObjectChange = this.onObjectChange.bind(this);
    Syncable.apply(this, arguments);
}

Set.prototype.rebuild = function (inner) {
    inner = inner || this._owner.getInnerState(this);
    if (!inner) {
        this.objects = {};
        return;
    }
    var objects = {};
    for(var stamp in inner.added) {
        var spec = inner.added[stamp];
        if (spec in objects) { continue; }
        var obj = this._owner.get(spec);
        objects[spec] = obj;
        obj.on('', this.onObjectChange); // FIXME prevent 2-listen
    }
};

Set.prototype.onObjectChange = function (ev) {
    this.emit({
        name: "change",
        object: ev.target,
        id: ev.target._id,
        event: ev,
        target: this
    });
};

Set.prototype.opdiff = function (inner) {
    // TODO
};

// An OR-Set implemented with Lamport timestamps
function InnerSet () {
    // added ids, {stamp: id}
    this.added = {};
}

InnerSet.prototype.add = function (op) {
    var spec = new Spec(op.value); //, '#' TODO default type
    var id = spec.id();
    var stamp = op.stamp();

    this.added[stamp] = spec.toString();

    this.emit({
        name: "add",
        value: id,
        spec: op.spec,
        target: this
    });
};

InnerSet.prototype.remove = function (op) {
    var stamp = op.value;
    if (stamp in this.added) {
        var id = this.added[stamp];
        delete this.added[stamp];
        this.emit({
            name: "remove",
            value: id,
            spec: op.spec,
            target: this
        });
    }
};

// Public API: Adds an object to the set.
Set.prototype.addObject = function (obj) {
    return this._owner.submit( this, 'set', obj.spec() );
};

Set.prototype.removeObject = function (obj) {
    var spec = obj.spec().toString(), ops = [];
    var inner = this._owner.getInnerState();
    for(var stamp in inner.added) {
        if (inner.added[stamp]===spec) {
            var op_spec = this.spec().add('.remove');
            ops.push(new Op(op_spec, stamp, null));
        }
    }
    return ops.length ? this.owner.submit(ops) : null;
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
