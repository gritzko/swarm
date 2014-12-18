"use strict";

var env = require('./env');
var Spec = require('./Spec');
var Syncable = require('./Syncable');
var Model = require('./Model'); // TODO
var ProxyListener = require('./ProxyListener');
var CollectionMethodsMixin = require('./CollectionMethodsMixin');

/**
 * Backbone's Collection is essentially an array and arrays behave poorly
 * under concurrent writes (see OT). Hence, our primary collection type
 * is a {id:Model} Set. One may obtain a linearized version by sorting
 * them by keys or otherwise.
 * This basic Set implementation can only store objects of the same type.
 * @constructor
 */
module.exports = Syncable.extend('Set', {

    defaults: {
        _objects: Object,
        _oplog: Object,
        _proxy: ProxyListener
    },

    mixins: [
        CollectionMethodsMixin
    ],

    reactions: {
        init: function (spec,val,src) {
            this.forEach(function (obj) {
                obj.on(this._proxy);
            }, this);
        }
    },

    ops: {
        /**
         * Both Model and Set are oplog-only; they never pass the state on the wire,
         * only the oplog; new replicas are booted with distilled oplog as well.
         * So, this is the only point in the code that mutates the state of a Set.
         */
        change: function (spec, value, repl) {
            value = this.distillOp(spec, value);
            var key_spec;
            for (key_spec in value) {
                if (value[key_spec] === 1) {
                    if (!this._objects[key_spec]) { // only if object not in the set
                        this._objects[key_spec] = this._host.get(key_spec);
                        this._objects[key_spec].on(this._proxy);
                    }
                } else if (value[key_spec] === 0) {
                    if (this._objects[key_spec]) {
                        this._objects[key_spec].off(this._proxy);
                        delete this._objects[key_spec];
                    }
                } else {
                    env.log(this.spec(), 'unexpected val', JSON.stringify(value));
                }
            }
        }
    },

    validate: function (spec, val, src) {
        if (spec.op() !== 'change') {
            return '';
        }

        for (var key_spec in val) {
            // member spec validity
            if (Spec.pattern(key_spec) !== '/#') {
                return 'invalid spec: ' + key_spec;
            }
        }
        return '';
    },

    distillOp: function (spec, val) {
        if (spec.version() > this._version) {
            return val; // no concurrent op
        }
        var opkey = spec.filter('!.');
        this._oplog[opkey] = val;
        this.distillLog(); // may amend the value
        return this._oplog[opkey] || {};
    },

    distillLog: Model.prototype.distillLog,

    pojo: function () {
        // invoke super.pojo()
        var result = Syncable._pt.pojo.apply(this, arguments);
        result.entries = Object.keys(this._objects);
        return result;
    },

    /**
     * Adds an object to the set.
     * @param {Syncable} obj the object  //TODO , its id or its specifier.
     */
    addObject: function (obj) {
        var specs = {};
        specs[obj.spec()] = 1;
        this.change(specs);
    },
    // FIXME reactions to emit .add, .remove

    removeObject: function (obj) {
        var spec = obj._id ? obj.spec() : new Spec(obj).filter('/#');
        if (spec.pattern() !== '/#') {
            throw new Error('invalid spec: ' + spec);
        }
        var specs = {};
        specs[spec] = 0;
        this.change(specs);
    },

    /**
     * @param {Spec|string} key_spec key (specifier)
     * @returns {Syncable} object by key
     */
    get: function (key_spec) {
        key_spec = new Spec(key_spec).filter('/#');
        if (key_spec.pattern() !== '/#') {
            throw new Error("invalid spec");
        }
        return this._objects[key_spec];
    },

    /**
     * @param {function?} order
     * @returns {Array} sorted list of objects currently in set
     */
    list: function (order) {
        var ret = [];
        for (var key in this._objects) {
            ret.push(this._objects[key]);
        }
        ret.sort(order);
        return ret;
    },

    forEach: function (cb, thisArg) {
        var index = 0;
        for (var spec in this._objects) {
            cb.call(thisArg, this._objects[spec], index++);
        }
    },

    every: function (cb, thisArg) {
        var index = 0;
        for (var spec in this._objects) {
            if (!cb.call(thisArg, this._objects[spec], index++)) {
                return false;
            }
        }
        return true;
    },

    filter: function (cb, thisArg) {
        var res = [];
        this.forEach(function (entry, idx) {
            if (cb.call(thisArg, entry, idx)) {
                res.push(entry);
            }
        });
        return res;
    },

    map: function (cb, thisArg) {
        var res = [];
        this.forEach(function (entry, idx) {
            res.push(cb.call(thisArg, entry, idx));
        });
        return res;
    }
});
