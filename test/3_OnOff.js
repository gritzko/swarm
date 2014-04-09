if (typeof require == 'function') {
    var swrm = require('../lib/swarm2.js');
    Swarm.Spec = swrm.Spec;
    Swarm = swrm.Swarm;
    Model = swrm.Model;
    Field = swrm.Field;
    Set = swrm.Set;
} else {
    exports = this.testEventRelay = {};
}



var Thermometer = Swarm.Model.extend('Thermometer',{
    defaults: {
        t: -20 // Russia :)
    }
});


asyncTest('3.a serialized on, reon', function (){
    console.warn(QUnit.config.current.testName);
    var storage = new DummyStorage(false);
    var uplink = new Swarm.Host('swarm~3a',0,storage);
    var downlink = new Swarm.Host('client~3a');
    // that's the default uplink.getSources = function () {return [storage]};
    
    var conn = new AsyncLoopbackConnection();
    
    var upperPipe = new Swarm.Pipe({host: uplink, sink: conn.pair}); // waits for 'data'/'close'
    upperPipe.connect(); // WTF???
    var lowerPipe = new Swarm.Pipe({host: downlink, sink: conn});
    lowerPipe.connect();
    
    downlink.getSources = function () {return [lowerPipe]};
    downlink.connect(lowerPipe); // lowerPipe.on(this) basically
    
    downlink.on('/Thermometer#room.init',function i(spec,val,obj){
        obj.set({t:22});
    });
    
    setTimeout(function x(){
        var o = uplink.objects['/Thermometer#room'];
        ok(o);
        o && equal(o.t,22);
        //downlink.disconnect(lowerPipe);
        start();
        upperPipe.close();
    },250);

    Swarm.localhost = uplink;  
});


asyncTest('3.b pipe reconnect, backoff', function (){
    console.warn(QUnit.config.current.testName);
    var storage = new DummyStorage(false);
    var uplink = new Swarm.Host('swarm~3b',0,storage);
    var downlink = new Swarm.Host('client~3b');
    uplink.availableUplinks = function () {return [storage]};
    downlink.availableUplinks = function () {
        var ret = [];
        for(var p in this.peers)
            ret.push(this.peers[p]);
        return ret;
    };
    var conn;
    
    var lowerPipe = new Swarm.Pipe({
        host: downlink,
        transport: function factory () {
            conn = new AsyncLoopbackConnection();
            var upperPipe = new Swarm.Pipe({ host: uplink, sink: conn.pair, peerName: '3.b.upper' }); // waits for 'data'/'close'
            upperPipe.connect();
            //var lowerPipe = new Swarm.Pipe({ host: downlink, sink: conn });
            return conn;
        },
        reconnectDelay: 1,
        peerName: '3.b.lower'
    });
    lowerPipe.connect();

    var thermometer = uplink.get(Thermometer), i=0;

    // OK. The idea is to connect/disconnect it 100 times then
    // check that the state is OK, there are no zombie listeners
    // no objects/hosts, log is 1 record long (distilled) etc

    var ih = setInterval(function(){
        thermometer.set({t:i});
        if (i++==30) {
            ok(thermometer._lstn.length<=2); // storage and maybe the client
            clearInterval(ih);
            start();
            lowerPipe.close();
        }
    },100);

    downlink.on(thermometer.spec().toString() + '.set', function i(spec,val,obj){
        console.log('YPA '+val);
        if (spec.method()==='set') {
            conn && conn.close(); // yeah; reconnect now
            conn = null;
        }
    });
    
});

