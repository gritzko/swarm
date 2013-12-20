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
        y: 0,
        name: FullName
    },
    $$move: function (spec,d) {
        this.x += d.x||0;
        this.y += d.y||0;
    }
});


test('Mickey the Mouse on/off', function(){

    var aleksisha = new Host('#aleksisha');
    var gritzko = new Host('#gritzko');
    aleksisha.on(gritzko);
    Swarm.localhost = gritzko;

    var mickey = new Mouse();

    mickey.move({x:1,y:1});

    equal(mickey.x,1);
    equal(mickey.y,1);

    var other = aleksisha.on(mickey.spec()); // FIXME what listener???

    equal(other.x,1);
    equal(other.y,1);
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



/*
// Reconciliation
mickey.move();
equal();
aleksisha.off(gritzko);
other.move();
equal();
mickey.init = null;
aleksisha.on(gritzko);
delete mickey.init;
equal();
gritzko.close();
aleksisha.close();

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