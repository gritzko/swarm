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

var Mouse = Model.extend('Mouse', {
    default: {
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
            var source = new Spec(key).source();
            notempty || (heads[source] && delete this._oplog[spec]);
            heads[source] = true;
        }
        return cumul;
    },
    $$move: function (spec,d) {
        // To implement your own ops you must understand implications
        // of partial order; in this case, if an op comes later than
        // an op that overwrites it then we skip it.
        var version = spec.version();
        if (version<this._version) {
            for(var opspec in this._oplog)
                if (opspec>'!'+version) {
                    var os = new Spec(opspec);
                    if (os.method()==='set' && os.version()>version)
                        return; // overwritten in the total order
                }
        }
        // Q if set is late => move is overwritten!
        this.x += d.x||0;
        this.y += d.y||0;
    }
});

function DummyStorage(async) {
    this.async = !!async || false;
    this.states = {};
    this.tails = {};
    this._id = 'dummy';
};
DummyStorage.prototype.deliver = function (spec,value,src) {
    var ti = spec.filter('/#');
    //var obj = this.states[ti] || (this.states[ti]={_oplog:{},_logtail:{}});
    var tail = this.tails[ti];
    if (!tail)
        this.tails[ti] = tail = {};
    var vm = spec.filter('!.');
    if (vm in tail)
        console.error('op replay @storage');
    tail[vm] = value;
};
DummyStorage.prototype.on = function () {
    var spec, replica;
    if (arguments.length===2) {
        spec = new Spec(arguments[0]);
        replica = arguments[1];
    } else
        throw 'xxx';
    var ti = spec.filter('/#'), self=this;
    function reply () {
        var state = self.states[ti];
        // FIXME mimic diff; init has id, tail has it as well
        if (state) {
            var response = {};
            response['!'+state._version+'.init'] = state;
            var tail = self.tails[ti];
            if (tail)
                for(var s in tail)
                    response[s] = tail[s];
            var clone = JSON.parse(JSON.stringify(response));
            replica.deliver(ti,clone,self);
        }
        replica.reon(ti,'!'+(state?state._version:'0'),self);
    }
    this.async ? setTimeout(reply,1) : reply();
};

DummyStorage.prototype.off = function (spec,value,src) {
};
DummyStorage.prototype.normalizeSignature = Syncable.prototype.normalizeSignature;

Swarm.debug = true;

//    S O  I T  F I T S

asyncTest('Handshake 1 K pattern', function () {
    console.warn('K pattern');

    var storage = new DummyStorage(true);
    // FIXME pass storage to Host
    var uplink = new Host('uplink~K',0,storage);
    var downlink = new Host('downlink~K');
    uplink.availableUplinks = function () {return [storage]};
    downlink.availableUplinks = function () {return [uplink]};
    uplink.on(downlink);

    Swarm.localhost = uplink;
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


asyncTest('Handshake 2 D pattern', function () {
    console.warn('D pattern');

    var storage = new DummyStorage(true);
    var uplink = new Host('uplink~D',storage);
    var downlink = new Host('downlink~D');
    uplink.availableUplinks = function () {return [storage]};
    downlink.availableUplinks = function () {return [uplink]};
    uplink.on(downlink);
    Swarm.localhost = downlink;

    storage.states['/Mouse#Mickey'] = {
        x:7,
        y:7,
        _version: '0eonago',
        _oplog:{
            '!0eonago.set': {x:7,y:7}
        }
    };

    // TODO
    //  * _version: !v1!v2
    //    v * add Spec.Map.toString(trim) {rot:ts,top:count}
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
        equal(obj._version,'0eonago');
        start();
    });
    var dlrepl = downlink.objects['/Mouse#Mickey'];

    // storage is async, waits a tick
    ok(!dlrepl.x);
    ok(!dlrepl.y);

});


asyncTest('Handshake 3 Z pattern', function () {
    console.warn('Z pattern');

    var storage = new DummyStorage(false);
    var uplink = new Host('uplink~Z',0,storage);
    var downlink = new Host('downlink~Z');
    uplink.availableUplinks = function () {return [storage]};
    downlink.availableUplinks = function () {return [storage]};

    var oldMickeyState = {
        x:7,
        y:7,
        _version: '0eonago',
        _oplog:{
        }
    };
    storage.states['/Mouse#Mickey'] = oldMickeyState;
    storage.tails['/Mouse#Mickey'] = 
        {
            '!1ail.set': {y:10}
        };

    Swarm.localhost = downlink;

    var dlrepl = new Mouse('Mickey',oldMickeyState);
    uplink.on('/Mouse#Mickey');
    var uprepl = uplink.objects[dlrepl.spec()];
    // TODO additive op
    // start with set()
    dlrepl.set({x:12});
    //uprepl.move({x:1,y:1});
    //downrepl.move({x:1,y:1});
    equal(uprepl.x,7);
    equal(uprepl.y,10);
    dlrepl.set({x:12});

    downlink.availableUplinks = function () {return [uplink]};
    console.warn('connect');
    uplink.on(downlink);

    // their respective changes must merge
    equal(dlrepl.x,12);
    equal(dlrepl.y,10);
    equal(uprepl.x,12);
    equal(uprepl.y,10);

    start();

});


asyncTest('Handshake 4 R pattern', function () {
    console.warn('R pattern');

    var storage = new DummyStorage(false);
    var uplink = new Host('uplink~R');
    var downlink = new Host('downlink~R');
    uplink.availableUplinks = function () {return [storage]};
    downlink.availableUplinks = function () {return [uplink]};
    uplink.on(downlink);
    Swarm.localhost = downlink;

    downlink.on('/Mouse#Mickey.init',function(spec,val,dlrepl){
        // there is no state in the uplink, dl provided none as well
        ok(!dlrepl.x);
        ok(!dlrepl.y);
        ok(!dlrepl._version);

        dlrepl.set({x:18,y:18});
        uprepl = uplink.objects['/Mouse#Mickey'];
        equal(uprepl.x,18);

        start();
    });

});


asyncTest('Handshake 5 A pattern', function () {
    console.warn('A pattern');

    var storage = new DummyStorage();
    var uplink = new Host('uplink~A');
    var downlink = new Host('downlink~A');
    uplink.availableUplinks = function () {return [storage]};
    downlink.availableUplinks = function () {return [uplink]};
    uplink.on(downlink);
    Swarm.localhost = downlink;

    var mickey = new Mouse('Mickey',{x:20,y:20});
    var uprepl = uplink.on('/Mouse#Mickey');
    var dlrepl = downlink.on('/Mouse#Mickey');

    equal(uprepl.x,20);
    equal(uprepl.y,20);
    equal(dlrepl.x,20);
    equal(dlrepl.y,20);

    start();

});


/*
test('Mickey the Mouse on/off', function(){
    console.warn('Mickey the Mouse on/off');
    // TODO tmp substitute hash function: uplink==author

    var aleksisha = new Host('#aleksisha');
    var gritzko = new Host('#gritzko');
    aleksisha.on(gritzko);
    Swarm.localhost = gritzko;

    var mickey = new Mouse('',{x:0,y:0}); // TODO normalize sig

    mickey.move({x:1,y:1});

    equal(mickey.x,1);
    equal(mickey.y,1);

    var other = aleksisha.on(mickey.spec()); // FIXME RELINKING!!!!!

    equal(other.x,1);
    equal(other.y,1);
    ok(other._oplog['!'+mickey._version+'.move']);
    equal(other._lstn[0],mickey);
    equal(mickey._lstn[0],other);
    equal(other._host,aleksisha);
    equal(mickey._host,gritzko);

    //var mouseType = gritzko.on('/Mouse');
    //equal(mouseType.$$move,Mouse.$$move);

    aleksisha.close();
    gritzko.close();
    Swarm.localhost = null;
    
});



test('Reconciliation', function () {
    console.warn('Reconciliation');
    var aleksisha = new Host('#aleksisha');
    var gritzko = new Host('#gritzko');
    aleksisha.on(gritzko);
    Swarm.localhost = gritzko;

    var mickey = new Mouse();
    var other = aleksisha.on(mickey.spec());

    mickey.move({x:1,y:1});
    
    equal(mickey.x,1);
    equal(mickey.y,1);
    equal(other.x,1);
    equal(other.y,1);
    
    aleksisha.off(gritzko);

    other.move({x:-1,y:1});
    equal(other.x,0);
    equal(other.y,2);
    equal(mickey.x,1);
    equal(mickey.y,1);

    mickey.init = null;
    aleksisha.on(gritzko);
    delete mickey.init;
    
    equal(other.x,0);
    equal(other.y,2);
    equal(mickey.x,0);
    equal(mickey.y,2);
    
    gritzko.close();
    aleksisha.close();
});
*/
/*

// Storage
gritzko.storage = new MemStorage();
gritzko.storage['/Mouse#Mickey'] = { x:5, y: 5, _version: '', _oplog: '' }; // + unapplied log!!!
...
var other = aleksisha.on('/Mouse#Mickey', track); // THINK anchor to prevent gc
equal(other.x,5); // applied

// Offline creation
// gritzko, aleksisha, maxmax, root
var other = new Mouse(aleksisha);
other.set({x:42});
gritzko.on(aleksisha);
equal (gritzko.storage['/Mouse#Mickey'].x, 42);

// Downlink propagation
var maxm = maxmaxmax.on('/Mouse#Mickey');
maxm.set({y:123});
equal(gritzkom.y, 123);
equal(aleksisham.y, 123);

// Overwrite & merge

maxmax.off(gritzko);
gritzkom.set({x:111, y:111});
maxmaxm.set({x: 222});
maxmax.on(gritzko);
equal(maxmaxm.y,111);
equal(maxmaxm.x,222);
equal(gritzkom.y,111);
equal(gritzkom.x,222);

// 3-layer arch (client, edge, switch)

new Host('root~switch');
new Host('root+gritzko');
new Host('root+maxmax');
new Host('gritzko~1');
new Host('maxmax~1');
maxmaxm.set({x:321});
equal(gritzkom.x,321);

// mesh reconfiguration

peers[4];

for() {
// close
one.set({x,i});
for()
equal(j.x,i);
// install back (random order reconnect)
equal();
}
*/
