"use strict";
var Swarm = require("../../"); // FIXME multipackage
var Spec = Swarm.Spec;

/** mission: no versioning, screens, still asynchronous, even further
  * then at the transport level */
function Gateway (host) {
    this.host = host;
    this.objects = {};
}
module.exports = Gateway;

Gateway.prototype.ON = function (type_id, id, listener) {
    var type = Swarm.Syncable.getType(type_id);
    var obj = new type(id, null, this.host); // FIXME get
    this.objects[obj._id] = obj; // FIXME Host must fetch known objects by id

    if (obj.entryType) {
        obj.onLoad4(function() {
            listener({
                name: 'load',
                target: obj,
                value:  obj.toPojoCollection()
            });
            obj.on4(listener);
        } );
    } else {
        obj.onInit4(function() {
            listener({
                name: 'init',
                target: obj,
                value:  obj.toPojo()
            });
            obj.on4(listener);
        } );
    }
    return obj.spec().toString(); //spec;//obj.toPojo();
};

Gateway.prototype.GET = function (id, callback) {
    var spec = (id in this.objects) ? this.objects[id].spec() : new Spec(id);
    var obj = this.host.get(spec);
    if (obj._version) {
        callback(obj.toPojo());
    } else {
        obj.on('.init', function(spec, val){
            callback(obj.toPojo());
        });
    }
    return spec;
};

Gateway.prototype.OFF = function (id, listener) {
    var obj = this.objects[id];
    if (obj) {
        obj.off4(this, listener);
    }
};

Gateway.prototype.SUBMIT = function (type, json, listener) {
    var type_fn = Swarm.Syncable.getType(type);
    var obj = new type_fn(json,this.host);
    var id = obj._id;
    if (listener) {
        this.ON(type,id,listener);
    }
    return obj.spec();
};

Gateway.prototype.SET = function (type, id, pojo) {
    var spec = new Spec(type,'/').add(id,'#');
    var obj = this.host.get(spec);
    var rspec = obj.set(pojo);
    return rspec;
};

Gateway.prototype.CSET = function (type, id, pojo) {
    var type_f = Swarm.Syncable.getType(type);
    var obj = new type_f(id, this.host);
    var spec = obj.set(pojo);
    return spec;
};

Gateway.prototype.INSERT = function (cid, id, pos) {
    var collection = this.objects[cid];
    if (id.prototype===Object) {
        id = this.SUBMIT(cid._entryType, id);
    }
    var spec = collection.insert(id,pos);
    return spec;
};

Gateway.prototype.REMOVE = function (cid, id) {
    var collection = this.objects[cid];
    var spec = collection.remove(id);
    return spec;
};
