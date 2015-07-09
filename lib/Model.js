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
        set: function (op) {
            var     vermet = op.spec.filter('!.').toString();
            var obj_value = JSON.parse(op.value);
            this._oplog[vermet] = obj_value;
            //if (version < this._version.substr(1)) {
            this.distillLog(); // may amend the value
            obj_value = this._oplog[vermet];
            //}  TODO optimize
            if (obj_value) {
                var old_vals = this.apply(obj_value);
                this.emit4({
                    name: "set",
                    value: JSON.parse(op.value),
                    spec: op.spec,
                    target: this,
                    old_value: old_vals,
                    old_version: this._version
                });
            }
        }
    },

    set: function (keys_values) {
        var pojo_kv = Syncable.toPojo(keys_values);
        for (var key in pojo_kv) {
            if (!Syncable.reFieldName.test(key)) {
                throw new Error("malformed field name: "+key);
            }
        }
        this._owner.submit( this, 'set', JSON.stringify(pojo_kv) );
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
        if ( ! (spec.op() in {set:1, state:1, diff:1, error:1, on:1, off:1}) ) {
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
