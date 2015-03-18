"use strict";
var Swarm = require("../../"); // FIXME multipackage
var Spec = Swarm.Spec;

/** mission: no versioning, screens, still asynchronous, even further
  * then at the transport level */
function Gateway (host) {
    this.host = host;
    this.objects = {};
    this.listeners = {};
}
module.exports = Gateway;

Gateway.prototype.ON = function (type_id, id, listener) {
    var type = Swarm.Syncable.getType(type_id);
    var obj = new type(id, null, this.host); // FIXME get
    var spec = obj.on4(this.onObjectEvent, this);
    this.objects[obj._id] = obj;
    var lstn = this.listeners[obj._id];
    if (!lstn) {
        lstn = this.listeners[obj._id] = [];
    }
    lstn.push(listener);
    if (obj._version) {
        listener({
            name: 'init',
            value: obj.toPojo()
        });
    } else {
        obj.on('.init', function(){
            listener({
                name: 'init',
                value: obj.toPojo()
            });
        });
    }
    return obj.spec().toString(); //spec;//obj.toPojo();
};

Gateway.prototype.onObjectEvent = function onObjectEvent (ev) {
    var id = ev.target._id;
    var lstn = this.listeners[id];
    if (lstn) {
        for(var i=0; i<lstn.length; i++) {
            lstn[i](ev);
        }
    } else {
        ev.target.off4(onObjectEvent,this);
    }
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

Gateway.prototype.OFF = function (id) {
    var obj = this.objects[id];
    if (obj) {
        obj.off4(this);
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

Gateway.prototype.SET = function (id_or_spec,json) {
    var id = new Spec(id_or_spec,'#').id();
    var obj = this.objects[id];
    var spec = obj.set(json);
    return spec;
};

Gateway.prototype.INSERT = function (cid,id,pos) {
    var collection = this.objects[cid];
    if (id.prototype===Object) {
        id = this.SUBMIT(cid._entryType, id);
    }
    var spec = collection.insert(id,pos);
    return spec;
};

Gateway.prototype.REMOVE = function (cid,id) {
    var collection = this.objects[cid];
    var spec = collection.remove(id);
    return spec;
};
