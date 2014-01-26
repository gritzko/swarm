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



var Thermometer = Model.extend('Thermometer',{
    defaults: {
        t: -20 // Russia :)
    }
});


asyncTest('serialized on, reon', function (){
    var storage = new DummyStorage(false);
    var uplink = new Host('swarm~A',0,storage);
    var downlink = new Host('client~B');
    
    var conn = new AsyncLoopbackConnection();
    
    var upperPipe = new Pipe(uplink,conn.pair,{}); // waits for 'data'/'close'
    var lowerPipe = new Pipe(downlink,conn,{});
    downlink.connect(lowerPipe); // lowerPipe.on(this) basically
    
    downlink.on('/Thermometer#room.init',function i(spec,val,obj){
        obj.set({t:22});
    });
    
    setTimeout(function x(){
        var o = uplink.objects['/Thermometer#room'];
        ok(o) && test(o.t,22);
        start();
    },25);

    Swarm.localhost = uplink;  
});

