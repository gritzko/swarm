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
    $$move: function (spec,d) {
        this.x += d.x||0;
        this.y += d.y||0;
    }
});

function DummyStorage() {
    this.store = {};
};
DummyStorage.prototype.deliver = function (spec,value,src) {
    var ti = spec.filter('/#');
    var obj = this.store[ti] || (this.store[ti]={_oplog:{}});
    var vm = spec.filter('!.');
    obj._oplog[vm] = value;
};
DummyStorage.prototype.on = function () {
    var spec, replica;
    if (arguments.length===2) {
        spec = new Spec(arguments[0]);
        replica = arguments[1];
    } else
        throw 'xxx';
    var ti = spec.filter('/#'), self=this;
    setTimeout(function(){
        if (ti in self.store)
            replica.init(ti,self.store[ti],self);
        replica.reon(ti,null,this); // FIXME pull in the state
    },1);
};
DummyStorage.prototype.off = function (spec,value,src) {
};
DummyStorage.prototype.normalizeSignature = Syncable.prototype.normalizeSignature;

Swarm.debug = true;

//    S O  I T  F I T S

asyncTest('Handshake 1 K pattern', function () {
    console.warn('K pattern');

    var storage = new DummyStorage(uplink);
    // FIXME pass storage to Host
    var uplink = new Host('uplink~K',0,storage);
    var downlink = new Host('downlink~K');
    uplink.availableUplinks = function () {return [storage]};
    downlink.availableUplinks = function () {return [uplink]};
    uplink.on(downlink);

    Swarm.localhost = uplink;
    var uprepl = new Mouse({x:3,y:3});
    downlink.on(uprepl.spec()+'.init',function(sp,val,obj){
        // FIXME init() happens before on()
        //  ? register ~ on ?
        //  missing sig - 1st param is the spec or spec filter
        //  host ~ event hub
        //
        //  host.on('/Mouse#Mickey.move',function(){})
        //  Option: id mismatch => spec to val? yep, unless deliver()
        //    '/Mouse#Mickey.on', 'move'
        //    event filter is the value of on() !!!
        //    sugg: retroactive init()
        //    the missing signature: x.emit('event',value),
        //      x.on('event',fn)
        //    host.on(Mouse,fn)
        //    host.on(Mouse) -- is actually a value
        //
        //  on() with a full filter:
        //    /Mouse#Mickey!now.on   !since.event   callback
        //  host's completely specd filter
        //    /Host#local!now.on   /Mouse#Mickey!since.event   callback
        equal(obj.x,3);
        equal(obj.y,3);
        equal(obj._version,uprepl._version);
        ok(storage.store[uprepl.spec()]);
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

    var storage = new DummyStorage();
    var uplink = new Host('uplink~D',storage);
    var downlink = new Host('downlink~D');
    uplink.availableUplinks = function () {return [storage]};
    downlink.availableUplinks = function () {return [uplink]};
    uplink.on(downlink);
    Swarm.localhost = downlink;

    storage.store['/Mouse#Mickey'] = {
        x:7,
        y:7,
        _oplog:{
            '!0eonago.set': {x:7,y:7}
        }
    };

    var dlrepl = downlink.on('/Mouse#Mickey',function(){
        equal(dlrepl.x,7);
        equal(dlrepl.y,7);
        equal(dlrepl._version,'!aeonago');
        start();
    });

    // storage is async, waits a tick
    ok(!dlrepl.x);
    ok(!dlrepl.y);

});


asyncTest('Handshake 3 Z pattern', function () {
    console.warn('Z pattern');

    var storage = new DummyStorage();
    var uplink = new Host('uplink~Z');
    var downlink = new Host('downlink~Z');
    uplink.availableUplinks = function () {return [storage]};
    downlink.availableUplinks = function () {return [uplink]};

    var oldMickeyState = {
        x:7,
        y:7,
        _oplog:{
            '!aeonago.set': {x:10,y:10}
        }
    };
    // ...
    storage.store['/Mouse#Mickey'] = oldMickeyState;
    var dlrepl = downlink.on('/Mouse#Mickey',oldMickeyState);

    uprepl.move({x:1,y:1});
    downrepl.move({x:1,y:1});

    uplink.on(downlink);

    // must add moves
    equal(uprepl.x,12);
    equal(downrepl.x,12);

    start();

});


asyncTest('Handshake 4 R pattern', function () {
    console.warn('R pattern');

    var storage = new DummyStorage();
    var uplink = new Host('uplink~R');
    var downlink = new Host('downlink~R');
    uplink.availableUplinks = function () {return [storage]};
    downlink.availableUplinks = function () {return [uplink]};
    uplink.on(downlink);
    Swarm.localhost = downlink;

    var dlrepl = downlink.on('/Mouse#Mickey',function(){
        // there is no state in the uplink, dl provided none as well
        ok(!dlrepl.x);
        ok(!dlrepl.y);
        ok(!dlrepl._version);

        dlrepl.set({x:18,y:18});
        uprepl = uplink.on('/Mouse#Mickey');
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
