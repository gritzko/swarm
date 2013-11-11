if (typeof require == 'function') {
    var swrm = require('../lib/swarm2.js');
    Spec = swrm.Spec;
    Swarm = swrm.Swarm;
    Model = swrm.Model;
    Field = swrm.Field;
    Set = swrm.Set;
} else {
    exports = this.testEventRelay = {};
}

//   IMPLEMENTATION PIPELINE
//
//   1 bare objects: on/off, version, diff
//   2 


function ShortPipe (a,b) {
    this.a = a;
    this.b = b;
    this.on(b.scope(),b.version(),b);
};

ShortPipe.prototype.close = function () {
    this.off(this.b.scope(),this.b.version(),this.b);
};

ShortPipe.prototype.deliver = function (spec,val,lstn) {
    var dest = lstn===this.a?this.b:this.a;
    spec.id = dest._id;
    console.log('>'+dest._id,spec,val);
    dest.deliver(spec,val,this);
};

ShortPipe.prototype.on  = function (spec,val,lstn) {
    spec.action = 'on';
    this.deliver(spec,val,lstn);
};
ShortPipe.prototype.reOn  = function (spec,val,lstn) {
    spec.action = 'reOn';
    this.deliver(spec,val,lstn);
};
ShortPipe.prototype.off  = function (spec,val,lstn) {
    spec.action = 'off';
    this.deliver(spec,val,lstn);
};
ShortPipe.prototype.reOff  = function (spec,val,lstn) {
    spec.action = 'reOff';
    this.deliver(spec,val,lstn);
};
ShortPipe.prototype.set  = function (spec,val,lstn) {
    spec.action = 'set';
    this.deliver(spec,val,lstn);
};


if (Swarm.root)
    Swarm.root.close();
var root = new Swarm('gritzko');

function Thermometer (id) {
    this.init(id);
};

Model.extend(Thermometer);
Thermometer.addProperty('t');
Swarm.addType(Thermometer);

test('on, reciprocal on', function () {
    var a = new Thermometer('apartment');
    var b = new Thermometer('balcony');
    a.t(25);
    b.t(15);
    var pipe = new ShortPipe(a,b); // open the door :)
    equal(a.t(),15);
    equal(b.t(),15);
    a.t(20);
    equal(a.t(),20);
    equal(b.t(),20);
    b.t(21);
    equal(a.t(),21);
    equal(b.t(),21);
    pipe.close();
    a.t(22);
    equal(a.t(),22);
    equal(b.t(),21);
});

