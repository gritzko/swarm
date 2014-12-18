"use strict";

var Spec = require('./Spec');
var LongSpec = require('./LongSpec');
var Syncable = require('./Syncable');
var ProxyListener = require('./ProxyListener');
var CollectionMethodsMixin = require('./CollectionMethodsMixin');

/** In distributed environments, linear structures are tricky. It is always
 *  recommended to use (sorted) Set as your default collection type. Still, in
 *  some cases we need precisely a Vector, so here it is. Note that a vector can
 *  not prune its mutation history for quite a while, so it is better not to
 *  sort (reorder) it repeatedly. The perfect usage pattern is a growing vector+
 *  insert sort or no sort at all. If you need to re-shuffle a vector
 *  differently or replace its contents, you'd better create a new vector.
 *  So, you've been warned.
 *  Vector is implemented on top of a LongSpec, so the API is very much alike.
 *  The replication/convergence/correctness algorithm is Causal Trees.
 *
 *  TODO support JSON types (as a part of ref-gen-refac)
 */
module.exports = Syncable.extend('Vector', {

    defaults: {
        _oplog: Object,
        _objects: Array,
        _order: LongSpec,
        _proxy: ProxyListener
    },

    mixins: [
        CollectionMethodsMixin
    ],

    ops: {  // operations is our assembly language

        // insert an object
        in: function (spec, value, src) {
            // we misuse specifiers to express the operation in
            // a compact non-ambiguous way
            value = new Spec(value);
            var opid = spec.tok('!');
            var at = value.tok('!');
            if (opid<=at) {
                throw new Error('timestamps are messed up');
            }
            var what = value.tok('#');
            if (!what) { throw new Error('object #id not specified'); }
            var type = value.get('/');
            if (!type && this.objectType) {
                type = this.objectType.prototype._type;
            }
            if (!type) {
                throw new Error('object /type not specified');
            }
            type = '/' + type;

            var pos = this.findPositionFor(opid, at?at:'!0');
            var obj = this._host.get(type+what);

            this._objects.splice(pos.index,0,obj);
            this._order.insert(opid,pos);

            obj.on(this._proxy);
        },

        // remove an object
        rm: function (spec, value, src) {
            value = Spec.as(value);
            var target = value.tok('!');
            var hint = value.has('.') ? Spec.base2int(value.get('.')) : 0;
            var at = this._order.find(target, Math.max(0,hint-5));
            if (at.end()) {
                at = this._order.find(target, 0);
            }
            if (at.end()) {
                // this can only be explained by concurrent deletion
                // partial order can't break cause-and-effect ordering
                return;
            }
            var obj = this._objects[at.index];
            this._objects.splice(at.index,1);
            at.erase(1);

            obj.off(this._proxy);
        }

        /** Either thombstones or log  before HORIZON
        patch: function (spec, value, src) {

        }*/

    },

    distillLog: function () {
        // TODO HORIZON
    },

    reactions: {

        'init': function fillAll (spec,val,src) { // TODO: reactions, state init tests
            for(var i=this._order.iterator(); !i.end(); i.next()) {
                var op = i.token() + '.in';
                var value = this._oplog[op];
                var obj = this.getObject(value);
                this._objects[i.index] = obj;
                obj.on(this._proxy);
            }
        }

    },

    pojo: function () {
        // invoke super.pojo()
        var result = Syncable._pt.pojo.apply(this, arguments);
        result.entries = Object.keys(this._objects);
        return result;
    },

    getObject: function (spec) {
        spec = new Spec(spec,'#');
        if (!spec.has('/')) {
            if (this.objectType) {
                spec = spec.add(this.objectType.prototype._type,'/').sort();
            } else {
                throw new Error("type not specified"); // TODO is it necessary at all?
            }
        }
        var obj = this._host.get(spec);
        return obj;
    },

    length: function () {
        return this._objects.length;
    },

    //  C A U S A L  T R E E S  M A G I C

    findPositionFor: function (id, parentId) { // FIXME protected methods && statics (entryType)
        if (!parentId) {
            parentId = this.getParentOf(id);
        }
        var next;
        if (parentId!=='!0') {
            next = this._order.find(parentId);
            if (next.end()) {
                next = this.findPositionFor(parentId);
            }
            next.next();
        } else {
            next = this._order.iterator();
        }
        // skip "younger" concurrent siblings
        while (!next.end()) {
            var nextId = next.token();
            if (nextId<id) {
                break;
            }
            var subtreeId = this.inSubtreeOf(nextId,parentId);
            if (!subtreeId || subtreeId<id) {
                break;
            }
            this.skipSubtree(next,subtreeId);
        }
        return next; // insert before
    },

    getParentOf: function (id) {
        var spec = this._oplog[id+'.in'];
        if (!spec) {
            throw new Error('operation unknown: '+id);
        }
        var parentId = Spec.as(spec).tok('!') || '!0';
        return parentId;
    },

    /** returns the immediate child of the root node that is an ancestor
      * of the given node. */
    inSubtreeOf: function (nodeId, rootId) {
        var id=nodeId, p=id;
        while (id>rootId) {
            p=id;
            id=this.getParentOf(id);
        }
        return id===rootId && p;
    },

    isDescendantOf: function (nodeId, rootId) {
        var i=nodeId;
        while (i>rootId) {
            i=this.getParentOf(i);
        }
        return i===rootId;
    },

    skipSubtree: function (iter, root) {
        root = root || iter.token();
        do {
            iter.next();
        } while (!iter.end() && this.isDescendantOf(iter.token(),root));
        return iter;
    },

    validate: function (spec, val, source) {
        // ref op is known
    },

    //  A R R A Y - L I K E  A P I
    //  wrapper methods that convert into op calls above

    indexOf: function (obj, startAt) {
        if (!obj._id) {
            obj = this.getObject(obj);
        }
        return this._objects.indexOf(obj,startAt);
    },

    /*splice: function (offset, removeCount, insert) {
        var ref = offset===-1 ? '' : this._objects[offset];
        var del = [];
        var hint;
        for (var rm=1; rm<=removeCount; rm++) {
            del.push(this._order.entryAt(offset+rm));
        }
        for(var a=3; a<this.arguments.length; a++) {
            var arg = this.arguments[a];
            arg = _id in arg ? arg._id : arg;
            if (!Spec.isId(arg)) { throw new Error('malformed id: '+arg); }
            ins.push(arg);
        }
        while (rmid=del.pop()) {
            this.del(rmid+hint);
        }
        while (insid=ins.pop()) {
            this.ins(ref+insid+hint);
        }
    },*/

    normalizePos: function (pos) {
        if (pos && pos._id) {
            pos=pos._id;
        }
        var spec = new Spec(pos,'#');
        var type = spec.type();
        var id = spec.id();
        for(var i=0; i<this._objects.length; i++) {
            var obj = this._objects[i];
            if (obj && obj._id===id && (!type || obj._type===type)) {
                break;
            }
        }
        return i;
    },

    /** Assuming position 0 on the "left" and left-to-right writing, the
      * logic of causal tree insertion is
      * insert(newEntry, parentWhichIsOnTheLeftSide). */
    insert: function (spec, pos) {
        // TODO bulk insert: make'em siblings
        if (pos===undefined) {
            pos = -1; // TODO ? this._order.length()
        }
        if (pos.constructor!==Number) {
            pos = this.normalizePos(pos);
        }
        if (spec && spec._id) {
            spec = spec.spec();
        } else /*if (spec.constructor===String)*/ {
            spec = new Spec(spec,'#');
        }
        // TODO new object
        var opid = pos===-1 ? '!0' : this._order.tokenAt(pos);
        // TODO hint pos
        return this.in(spec+opid);
    },

    insertAfter: function (obj, pos) {
        this.insert (obj,pos);
    },

    insertBefore: function (spec, pos) {
        if (pos===undefined) {
            pos = this._order.length();
        }
        if (pos.constructor!==Number) {
            pos = this.normalizePos(pos);
        }
        this.insert(spec,pos-1);
    },

    append: function append (spec) {
        this.insert(spec,this._order.length()-1);
    },

    remove: function remove (pos) {
        if (pos.constructor!==Number) {
            pos = this.normalizePos(pos);
        }
        var hint = Spec.int2base(pos,0);
        var op = this._order.tokenAt(pos);
        this.rm(op+'.'+hint); // TODO generic spec quants
    },

    // Set-compatible, in a sense
    addObject: function (obj) {
        this.append(obj);
    },

    removeObject: function (pos) {
        this.remove(pos);
    },

    objectAt: function (i) {
        return this._objects[i];
    },

    insertSorted: function (obj, cmp) {
    },

    setOrder: function (fn) {
    },

    forEach: function (cb, thisArg) {
        this._objects.forEach(cb, thisArg);
    },

    every: function (cb, thisArg) {
        return this._objects.every(cb, thisArg);
    },

    filter: function (cb, thisArg) {
        return this._objects.filter(cb, thisArg);
    },

    map: function (cb, thisArg) {
        return this._objects.map(cb, thisArg);
    }

});
