var Swarm        = require('../');
var Spec         = Swarm.Spec;
var Model        = Swarm.Model;
var Set          = Swarm.Set;
var DummyStorage = require('../lib/DummyStorage');

/** Must be constructed from String, serialized into a String.
    JSON string is OK :) */
function FullName (name) {
    var m = name.match(/(\S+)\s+(.*)/);
    this.first = m[1];
    this.last = m[2];
}
FullName.prototype.toString = function () {
    return this.first + ' ' + this.last;
}

var Mouse = Swarm.Model.extend('Mouse', {
    defaults: {
        x: 0,
        y: 0
        //name: FullName
    },
    // adapted to handle the $$move op
    TODO_distillLog: function () {
        // explain
        var sets = [], cumul = {}, heads = {};
        for(var spec in this._oplog)
            if (Spec.get(spec,'.')==='.set')
                sets.push(spec);
        sets.sort();
        for(var i=sets.length-1; i>=0; i--) {
            var spec = sets[i], val = this._oplog[spec], notempty=false;
            for(var key in val)
                if (key in cumul)
                    delete val[key];
                else
                    notempty = cumul[key] = true;
            var source = new Swarm.Spec(key).source();
            notempty || (heads[source] && delete this._oplog[spec]);
            heads[source] = true;
        }
        return cumul;
    },
    ops: {
        move: function (spec,d) {
            // To implement your own ops you must understand implications
            // of partial order; in this case, if an op comes later than
            // an op that overwrites it then we skip it.
            var version = spec.version();
            if (version<this._version) {
                for(var opspec in this._oplog)
                    if (opspec>'!'+version) {
                        var os = new Swarm.Spec(opspec);
                        if (os.op()==='set' && os.version()>version)
                            return; // overwritten in the total order
                    }
            }
            // Q if set is late => move is overwritten!
            this.x += d.x||0;
            this.y += d.y||0;
        }
    }
});

var Mice = Swarm.Set.extend('Mice', {
});

//    S O  I T  F I T S

asyncTest('6.a Handshake K pattern', function () {
    console.warn(QUnit.config.current.testName);

    var storage = new DummyStorage(true);
    // FIXME pass storage to Swarm.Host
    var uplink = new Swarm.Host('uplink~K',0,storage);
    var downlink = new Swarm.Host('downlink~K');
    uplink.getSources = function () {return [storage]};
    downlink.getSources = function () {return [uplink]};
    uplink.on(downlink);

    Swarm.setLocalhost(uplink);
    var uprepl = new Mouse({x:3,y:3});
    downlink.on(uprepl.spec()+'.init',function(sp,val,obj){
        //  ? register ~ on ?
        //  host ~ event hub
        //    the missing signature: x.emit('event',value),
        //      x.on('event',fn)
        //    host.on(Mouse,fn)
        //    host.on(Mouse) -- is actually a value
        //  on() with a full filter:
        //    /Mouse#Mickey!now.on   !since.event   callback
        //  host's completely specd filter
        //    /Host#local!now.on   /Mouse#Mickey!since.event   callback
        equal(obj.x,3);
        equal(obj.y,3);
        equal(obj._version,uprepl._version);
        // TODO this happens later ok(storage.states[uprepl.spec()]);
        start();
    });
    var dlrepl = downlink.objects[uprepl.spec()];
    // here we have sync retrieval, so check it now
    //equal(dlrepl.x,3);
    //equal(dlrepl.y,3);
    //equal(dlrepl._version,dlrepl._id);
    // NO WAY, storage is async
});


asyncTest('6.b Handshake D pattern', function () {
    console.warn(QUnit.config.current.testName);

    var storage = new DummyStorage(true);
    var uplink = new Swarm.Host('uplink~D',storage);
    var downlink = new Swarm.Host('downlink~D');
    uplink.getSources = function () {return [storage]};
    downlink.getSources = function () {return [uplink]};
    uplink.on(downlink);
    Swarm.setLocalhost(downlink);

    storage.states['/Mouse#Mickey'] = {
        x:7,
        y:7,
        _version: '!0eonago',
        _oplog:{
            '!0eonago.set': {x:7,y:7}
        }
    };

    // TODO
    //  * _version: !v1!v2
    //    v * add Swarm.Spec.Map.toString(trim) {rot:ts,top:count}
    //      * if new op !vid was trimmed => add manually
    //      * if new op vid < _version => check the log (.indexOf(src))
    //    v * sort'em
    //  * clean $$set
    //  * add testcase: Z-rotten
    //      * old replica with no changes (no rot)
    //      * old repl one-side changes
    //      * old repl two-side changes (dl is rotten)
    //  * document it
    //  * "can't remember whether this was applied" situation
    //      * high concurrency offline use
    //
    //  The underlying assumption: either less than 5 entities
    //  touch it or they don't do it at once (if your case is
    //  different consider RPC impl)
    //  Model.ROTSPAN
    //  Model.COAUTH

    downlink.on('/Mouse#Mickey.init',function(spec,val,obj){
        equal(obj._id,'Mickey');
        equal(obj.x,7);
        equal(obj.y,7);
        equal(obj._version,'!0eonago');
        start();
    });
    var dlrepl = downlink.objects['/Mouse#Mickey'];

    // storage is async, waits a tick
    ok(!dlrepl.x);
    ok(!dlrepl.y);

});

// both uplink and downlink have unsynchronized changes
asyncTest('6.c Handshake Z pattern', function () {
    console.warn(QUnit.config.current.testName);

    var storage = new DummyStorage(false);
    var oldstorage = new DummyStorage(false);
    var uplink = new Swarm.Host('uplink~Z',0,storage);
    var downlink = new Swarm.Host('downlink~Z');
    uplink.getSources = function () {return [storage]};
    downlink.getSources = function () {return [oldstorage]};

    var oldMickeyState = {
        x:7,
        y:7,
        _version: '!0eonago',
        _oplog:{
            '!0eon+ago.set' : {y:7},
            '!000ld+old.set': {x:7}
        }
    };
    storage.states['/Mouse#Mickey'] = oldMickeyState;
    oldstorage.states['/Mouse#Mickey'] = oldMickeyState;

    // new ops at the uplink' storage
    storage.tails['/Mouse#Mickey'] = 
        {
            '!1ail+old.set': {y:10}
        };

    Swarm.setLocalhost(downlink);

    var dlrepl = new Mouse('Mickey',oldMickeyState);
    uplink.on('/Mouse#Mickey');
    var uprepl = uplink.objects[dlrepl.spec()];

    // offline changes at the downlink
    dlrepl.set({x:12});

    // ...we see the tail applied, downlink changes not here yet
    equal(uprepl.x,7);
    equal(uprepl.y,10);

    // Two uplinks! The "server" and the "cache".
    downlink.getSources = function () {return [oldstorage,uplink]};
    console.warn('connect');
    uplink.on(downlink);

    // their respective changes must merge
    equal(dlrepl.x,12);
    equal(dlrepl.y,10);
    equal(uprepl.x,12);
    equal(uprepl.y,10);

    start();

});


asyncTest('6.d Handshake R pattern', function () {
    console.warn(QUnit.config.current.testName);

    var storage = new DummyStorage(false);
    var uplink = new Swarm.Host('uplink~R');
    var downlink = new Swarm.Host('downlink~R');
    uplink.getSources = function () {return [storage]};
    downlink.getSources = function () {return [uplink]};
    uplink.on(downlink);
    Swarm.setLocalhost(downlink);

    downlink.on('/Mouse#Mickey.init',function(spec,val,dlrepl){
        // there is no state in the uplink, dl provided none as well
        ok(!dlrepl.x);
        ok(!dlrepl.y);
        equal(dlrepl._version,'!0'); // auth storage has no state

        dlrepl.set({x:18,y:18}); // FIXME this is not R
        uprepl = uplink.objects['/Mouse#Mickey'];
        equal(uprepl.x,18);

        start();
    });

});


asyncTest('6.e Handshake A pattern', function () {
    console.warn(QUnit.config.current.testName);

    var storage = new DummyStorage(false);
    var uplink = new Swarm.Host('uplink~A');
    var downlink = new Swarm.Host('downlink~A');
    uplink.getSources = function () {return [storage]};
    downlink.getSources = function () {return [uplink]};
    uplink.on(downlink);
    Swarm.setLocalhost(downlink);

    var mickey = new Mouse({x:20,y:20});
    equal(mickey._id, mickey._version.substr(1));
    
    // FIXME no value push; this is R actually
    setTimeout(function check(){    
        var uprepl = uplink.objects[mickey.spec()];
        var dlrepl = downlink.objects[mickey.spec()];
        equal(uprepl.x,20);
        equal(uprepl.y,20);
        equal(dlrepl.x,20);
        equal(dlrepl.y,20);
        start();
    }, 100);

});


test('6.f Handshake and sync', function () {
    console.warn(QUnit.config.current.testName);

    var storage = new DummyStorage(false);
    var uplink = new Swarm.Host('uplink~F',0,storage);
    var downlink1 = new Swarm.Host('downlink~F1');
    var downlink2 = new Swarm.Host('downlink~F2');
    uplink.getSources = function () {return [storage]};
    downlink1.getSources = function () {return [uplink]};
    downlink2.getSources = function () {return [uplink]};
    
    uplink.on(downlink1);

    Swarm.setLocalhost(downlink1);
    
    var miceA = downlink1.get('/Mice#mice');
    var miceB = downlink2.get('/Mice#mice');
    
    var mickey1 = downlink1.get('/Mouse');
    var mickey2 = downlink2.get('/Mouse');
    miceA.addObject(mickey1);

    uplink.on(downlink2);
    
    var mickey1at2 = miceB.objects[mickey1.spec()];
    ok(miceA.objects[mickey1.spec()]);
    ok(mickey1at2);
    miceB.addObject(mickey2);

    var mickey2at1 = miceA.objects[mickey2.spec()];
    ok(miceB.objects[mickey2.spec()]);
    ok(mickey2at1);

    mickey1.set({x:0xA});    
    mickey2.set({x:0xB});
    equal(mickey1at2.x,0xA);
    equal(mickey2at1.x,0xB);

    mickey1at2.set({y:0xA});    
    mickey2at1.set({y:0xB});
    equal(mickey1.y,0xA);
    equal(mickey2.y,0xB);
});


