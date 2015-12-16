"use strict";
var Swarm = require('swarm-syncable');
var Syncable = Swarm.Syncable;
var Spec = Swarm.Spec;
var Op = Swarm.Op;

//
//    client ---> gateway ---> logics ---> host ---> storage, server
//  * reads from an arbitrary stream
//  * line based abbreviated outer protocol as described in outer.md

// CONVERTS the OUTER API TO A STREAM

/** mission: no versioning, screens, still asynchronous, even further
  * then at the transport level */
function Gateway (host) {
    this.onChange = this.onChangeProto.bind(this);
    this.host = host;
    this.streams = {};
    this.subscribers = {};
}
Swarm.Gateway = Gateway;
module.exports = Swarm;

Gateway.prototype.removeStream = function (stream_id) {
    delete this.streams[stream_id];
    for (var spec in this.subscribers) {
        this.subscribers[spec] = this.subscribers[spec].filter(function (x) { return x != stream_id; });
    }
}

Gateway.prototype.addStream = function (stream_id, stream) {
    var self = this;
    var unparsed = '';
    this.streams[stream_id] = stream;
    stream.on('data', function(data) {
        unparsed += data.toString();
        if (unparsed == '\n') {
            stream.write('\n');
            unparsed = '';
            return;
        }
        var parsed;
        try {
            parsed = Op.parse(unparsed, stream_id);
        } catch (e) {
            console.log('Op.parse error: ', e);
            return;
        }

        unparsed = parsed.remainder;
        // seek \n => parse the op
        for (var i=0; i<parsed.ops.length; i++) {
            var op = parsed.ops[i];
            op.spec = new Spec(unabbreviate(op.spec, stream_id));
            self.receive(op);
        }
    });
};

Gateway.prototype.receive = function (op) {
    switch (op.op()) {
    case 'ON':    this.ON(op, op.source); break;
    case 'ONCE':  this.ONCE(op, op.source); break;
    case 'STATE': this.STATE(op, op.source); break;
    case 'OFF':   this.OFF(op, op.source); break;
    }
};

var abbrev = new Spec('/Model');

function abbreviate (spec, stream_stamp) {
    abbrev._stamp = stream_stamp;
    return new Spec(spec).toString(abbrev);
}

function unabbreviate (spec, stream_stamp) {
    abbrev._stamp = stream_stamp;
    return new Spec(spec, abbrev).toString();
}

// on every change, send full object state to subscribers
Gateway.prototype.onChangeProto = function (ev) {
    var spec = ev.target.spec();
    var subs = this.subscribers[spec], self = this;
    subs.forEach(function(sub){
        self.sendState(ev.target, sub);
    });
};

Gateway.prototype.sendState = function (obj, stream_id) {
    var stream = this.streams[stream_id];
    var json = obj.toString();
    var ver = obj._version || '0'; // new Spec(obj._version).get('!') || '0';
    var evspec = obj.spec().add(ver, '!').add('.STATE'); // no !ver
    evspec = abbreviate(evspec);
    try {
        stream && stream.write(evspec + '\t' + json + '\n');
    } catch (e) {
        console.log('sendState error:', e);
    }
};

// a new subscriber for an object
Gateway.prototype.ON = function (op, stream_id, once) {
    var spec = op.spec.filter('/#');
    var subs = this.subscribers[spec], self = this;
    var obj = this.host.get(spec);
    //if (obj.hasState()) {
    //    this.sendState(obj, stream_id);
    //} // else the 'init' event will trigger our onChange
    if (subs) {
        subs.push(stream_id);
    } else {
        subs = this.subscribers[spec] = [stream_id];
        obj.on('change', self.onChange); // TODO test for machinegunning
    }
    obj.onInit(function(){
        self.sendState(obj, stream_id);
    });
};

// Retrieve once, no listen. Equals (.ON .OFF)
Gateway.prototype.ONCE = function (op, stream_id) {
    this.ON(op, stream_id, true);
};

// Unsubscribe
Gateway.prototype.OFF = function (op, stream_id) {
    var spec = op.spec.filter('/#');
    if (spec.pattern()!=='/#') {
        throw new Error('malformed request');
    }
    var subs = this.subscribers[spec];
    if (!subs) { return; }
    var i = subs.indexOf(stream_id);
    if (i===-1) { return; }
    subs.splice(i, 1);
    if (subs.length===0) {
        delete this.subscribers[spec];
        var obj = this.logics.get(op.spec);
        obj.off(spec, this.onChange);
    }
};

// Possibly create, then set, then save
Gateway.prototype.STATE = function (op, stream_id) {

    var spec = op.spec.filter('/#');
    var json;
    try {
        json = JSON.parse(op.value);
    } catch (e) {
        console.log('Parse error:', e);
        return;
    }
    var outer = this.host.get(spec);
    outer.set(json);
    // this triggers events that trigger onChange, so the stream gets a response
    if (!op.id()) {
        this.ON(new Op(outer.spec(), ''), stream_id);
    }
};
