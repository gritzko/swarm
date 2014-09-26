"use strict";

var Spec = require('./Spec');
var Syncable = require('./Syncable');

/**
 * Model (LWW key-value object)
 * @param idOrState
 * @constructor
 */
function Model(idOrState) {
    var ret = Model._super.apply(this, arguments);
    /// TODO: combine with state push, make clean
    if (ret === this && idOrState && idOrState.constructor !== String && !Spec.is(idOrState)) {
        this.deliver(this.spec().add(this._id, '!').add('.set'), idOrState);
    }
}

module.exports = Syncable.extend(Model, {
    defaults: {
        _oplog: Object
    },
    /**  init modes:
     *    1  fresh id, fresh object
     *    2  known id, stateless object
     *    3  known id, state boot
     */
    neutrals: {
        on: function (spec, base, repl) {
            //  support the model.on('field',callback_fn) pattern
            if (typeof(repl) === 'function' &&
                    typeof(base) === 'string' &&
                    (base in this.constructor.defaults)) {
                var stub = {
                    fn: repl,
                    key: base,
                    self: this,
                    _op: 'set',
                    deliver: function (spec, val, src) {
                        if (this.key in val) {
                            this.fn.call(this.self, spec, val, src);
                        }
                    }
                };
                repl = stub;
                base = '';
            }
            // this will delay response if we have no state yet
            Syncable._pt._neutrals.on.call(this, spec, base, repl);
        },

        off: function (spec, base, repl) {
            var ls = this._lstn;
            if (typeof(repl) === 'function') { // TODO ugly
                for (var i = 0; i < ls.length; i++) {
                    if (ls[i] && ls[i].fn === repl && ls[i].key === base) {
                        repl = ls[i];
                        break;
                    }
                }
            }
            Syncable._pt._neutrals.off.apply(this, arguments);
        }

    },

    // TODO remove unnecessary value duplication
    packState: function (state) {
    },
    unpackState: function (state) {
    },
    /**
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
            value && this.apply(value);
        }
    },

    fill: function (key) { // TODO goes to Model to support references
        if (!this.hasOwnProperty(key)) {
            throw new Error('no such entry');
        }

        //if (!Spec.is(this[key]))
        //    throw new Error('not a specifier');
        var spec = new Spec(this[key]).filter('/#');
        if (spec.pattern() !== '/#') {
            throw new Error('incomplete spec');
        }

        this[key] = this._host.get(spec);
        /* TODO new this.refType(id) || new Swarm.types[type](id);
         on('init', function(){
         self.emit('fill',key,this)
         self.emit('full',key,this)
         });*/
    },

    /**
     * Generate .set operation after some of the model fields were changed
     * TODO write test for Model.save()
     */
    save: function () {
        var cumul = this.distillLog(),
            changes = {},
            pojo = this.pojo(),
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
        if (spec.op() !== 'set') {
            return '';
        } // no idea
        for (var key in val) {
            if (!Syncable.reFieldName.test(key)) {
                return 'bad field name';
            }
        }
        return '';
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
