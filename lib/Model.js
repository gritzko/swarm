"use strict";

var Spec = require('./Spec');
var Syncable = require('./Syncable');


module.exports = Syncable.extend("Model", {
    defaults: {
        _oplog: Object
        // TODO 0.45 inner vs outer state
    },

    /**  TODO move to storage
     * Removes redundant information from the log; as we carry a copy
     * of the log in every replica we do everythin to obtain the minimal
     * necessary subset of it.
     * As a side effect, distillLog allows up to handle some partial
     * order issues (see _ops.set).
     * @see Model.ops.set
     * @returns {*} distilled log {spec:true}
     */
    distillLog: function () {
        // explain
        var sets = [],
            cumul = {},
            heads = {},
            spec;
        for (var s in this._oplog) {
            spec = new Spec(s);
            //if (spec.op() === 'set') {
            sets.push(spec);
            //}
        }
        sets.sort();
        for (var i = sets.length - 1; i >= 0; i--) {
            spec = sets[i];
            var val = this._oplog[spec],
                notempty = false;
            for (var field in val) {
                if (field in cumul) {
                    delete val[field];
                } else {
                    notempty = cumul[field] = val[field]; //store last value of the field
                }
            }
            var source = spec.source();
            notempty || (heads[source] && delete this._oplog[spec]);
            heads[source] = true;
        }
        return cumul;
    },
    
    
    ops: {
        /**
         * This barebones Model class implements just one kind of an op:
         * set({key:value}). To implment your own ops you need to understand
         * implications of partial order as ops may be applied in slightly
         * different orders at different replicas. This implementation
         * may resort to distillLog() to linearize ops.
         */
        set: function (spec, value, repl) {
            var version = spec.version(),
                vermet = spec.filter('!.').toString();
            if (version < this._version.substr(1)) {
                this._oplog[vermet] = value;
                this.distillLog(); // may amend the value
                value = this._oplog[vermet];
            }
            if (value) {
                var obj_value = JSON.parse(value);
                var old_vals = this.apply(obj_value);
                if (this._events) {
                    this._events.queued.push({
                        name: "set",
                        value: obj_value,
                        spec: spec,
                        target: this,
                        old_value: old_vals,
                        old_version: this._version
                    });
                }
            }
        }
    },

    /**
     * Generate .set operation after some of the model fields were changed
     * TODO write test for Model.save()
     */
    save: function () {
        var cumul = this.distillLog(),
            changes = {},
            pojo = this.toPojo(),
            field;
        for (field in pojo) {
            if (this[field] !== cumul[field]) {// TODO nesteds
                changes[field] = this[field];
            }
        }
        for (field in cumul) {
            if (!(field in pojo)) {
                changes[field] = null; // JSON has no undefined
            }
        }
        this.set(changes);
    },

    validate: function (spec, val) {
        if ( ! (spec.op() in {set:1, state:1, bundle:1, error:1}) ) {
            return 'unknown op';
        }
        /*var value = JSON.parse(val);
        for (var key in value) {
            if (!Syncable.reFieldName.test(key)) {
                return 'bad field name';
            }
        } TODO */
        return '';
    },

    on4: function (filter, callback, context) {
        if (filter.constructor===Function) {
            context = callback;
            callback = filter;
            filter = null;
        }
        var m = filter && filter.match(/^set:(\w+)$/);
        if (m) {
            var field_name = m[1];
            filter = function (ev) {
                return field_name in ev.value;
            };
        }
        Syncable._pt.on4.call(this, filter, callback, context);
    }

});

// Model may have reactions for field changes as well as for 'real' ops/events
// (a field change is a .set operation accepting a {field:newValue} map)
module.exports.addReaction = function (methodOrField, fn) {
    var proto = this.prototype;
    if (typeof (proto[methodOrField]) === 'function') { // it is a field name
        return Syncable.addReaction.call(this, methodOrField, fn);
    } else {
        var wrapper = function (spec, val) {
            if (methodOrField in val) {
                fn.apply(this, arguments);
            }
        };
        wrapper._rwrap = true;
        return Syncable.addReaction.call(this, 'set', wrapper);
    }
};
