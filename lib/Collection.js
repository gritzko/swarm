"use strict";

var Spec = require('./Spec');
var IdArray = require('./IdArray');
var Syncable = require('./Syncable');
var ProxyListener = require('./ProxyListener');

/** Abstract base class for "smaller" collections.
    Backbone. 4000 full load */
var Collection = Syncable.extend('Collection', {

    defaults: {
        ids: IdArray,
        ins: IdArray,
        rms: IdArray, // TODO shared codebook
        _proxy: ProxyListener,
        _oplog: Object  // TODO move to Storage
    },

    ops: {
        in: function (spec, value, src) {
            var m = Collection.reTokExtSpKey.exec(value);
            var obj_id=m[1], key=m[4];
            var pos = this._findPosFor(spec, value, obj_id, key);
            this.ids.insert(obj_id, pos);
            this.ins.insert(spec.version(), pos);
            this.rms.insert("0", pos);
            if (this._keys) {
                this._keys.splice(pos,0,key);
            }
            this._rebuild(pos);
        },

        rm: function (spec, value, src) {
            var op_id = value; // TODO valid
            var pos = this.ins.find(op_id);
            this.rms.splice(pos,1,spec.version());
            this._rebuild(pos);
        }
    },

    reactions: {
        init: function (spec,val,src) {
            this._rebuild();
        }
    },

    diff: function (base) {
        if (!base || base=='!0') { // == !
            return this.pojo(true);
        } else {
            return Syncable._pt.diff.apply(this, arguments);
        }
    },

    _rebuild: function (pos) {
    },

    _findPosFor: function (spec, value) {
        return this.ids.length();
    },

    validate: function (spec, value) {
        if (spec.op()==="ins") {
            if (!Collection.reTokExtSpKey.test(value)) {
                return "invalid op value";
            }
        }
        return '';
    },

    _forEach: function (cb) { // TODO reimpl over view (has objs)
        var idi = this.ids._iter();
        var rmi = this.rms._iter();
        var ini = this.ins._iter();
        while (idi.match) {
            var rm = this.rms._decode(this.rms._at(rmi)); // FIXME humane, iter.value
            if (rm==='0') {
                var id = this.ids._decode(this.ids._at(idi));
                var op = this.ins._decode(this.ins._at(ini));
                cb(id, op, rm);
            }
            this.ids._next(idi);
            this.rms._next(rmi);
            this.ins._next(ini);
        }

    },

    gc: function () {

    },

    remove: function (op_id) {

    },

    insert: function (obj_id, key_str) {

    }

});

Collection.rsTokExtSpKey = '^((=)(?:\\+(=))?)(?: (.*))$'.replace(/=/g, Spec.rT);
Collection.reTokExtSpKey = new RegExp(Collection.rsTokExtSpKey);
module.exports = Collection;


Collection.Vector = Collection.extend('Vector', {

    _arg2id: function (obj, mayCreate) {
        if (!obj) {throw new Error("no null entries allowed (yet?)");}
        var spec;
        if (obj._id) {
            spec = obj.spec();
        } else if (Spec.is(obj)) {
            spec = new Spec(obj);
        } else if (mayCreate && obj.constructor===Object) { // new obj
            var o = new Syncable.types[this.entryType](obj);
            spec = o.spec();
        } else {
            throw new Error("not an object or a spec: "+obj);
        }
        if (spec.type()!==this.entryType) {
            throw new Error("only accept type "+this.entryType);
        }
        return spec.id();
    },

    _findPosFor: function (spec, value, id, key) {
        var i, ins = this.ins;
        if (key==='0') {
            i = ins._iter();
        } else {
            i = ins._find(ins.encode(key));
            if (i.match) { // FIXME correctness/order
                ins._next(i);
            }
        }
        var op_ver = spec.version();
        while (i.match && ins._decode(i.value)>op_ver) {
            ins._next(i);
        }
        return i.pos;
    },

    _rebuild: function (pos) {
        var self = this;
        self.vector = [];
        self._forEach(function (id){
            self.vector.push(self._object(id));
        });
        // TODO optimize
    },

    _object: function (id) {
        if (!id) { return null; }
        var spec = '/'+this.entryType+'#'+id;
        var obj = this._host.get(spec);
        return obj;
    },

    push: function (obj) {
        var last_in = '0';
        this._forEach(function(id,op,rm){ // FIXME :(
            last_in = op;
        });
        this["in"](this._arg2id(obj, true)+' '+last_in);
    },

    unshift: function (obj) {
        this["in"](this._arg2id(obj, true)+' 0');
    },

    pop: function () {
        var last_in = '0', last_id;
        this._forEach(function(id,op,rm){ // FIXME :(
            last_in = op;
            last_id = id;
        });
        this.rm(last_in);
        return this._object(last_id);
    },

    shift: function () {
        var last_in, last_id;
        this._forEach(function(id,op,rm){ // FIXME :(
            if (!last_in) {
                last_in = op;
                last_id = id;
            }
        });
        if (last_in) {
            this.rm(last_in);
        }
        return this._object(last_id);
    }

});
