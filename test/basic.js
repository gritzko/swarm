var swarm = require('../lib/swarm.js');
var Swarm = swarm.Swarm;
var LocalPeer = swarm.LocalPeer;
var assert = require('assert');

function Obj (id) {
    this._id = id;
    this.key = '';
    this._lstn = [];
}
Swarm.extend(Obj);


var port = process.argv[2];
var hubPort = process.argv[3];
console.log('swarm peer starts at port',port);
Swarm.listen({port:port});
if (hubPort)
    Swarm.connectPeer('ws://localhost:'+hubPort);

/*var serverA = new Swarm('&00-Aa');
var serverB = new Swarm('&00-Bb');
var storage = new MemoryStorage();
Swarm.addPeer(serverA);
Swarm.addPeer(serverB);
Swarm.addStorage(storage);

var clientA = new Swarm('&AA');
clientA.addPeer(serverA);
var clientB = new Swarm('&BB');
clientB.addPeer(serverB);

// all sync
var objA = clientA.open(new Obj()); // most natural form
var objB = clientB.open(new Obj(objA._id));

assert.equal(objA.key,'');
objA.set('key','testA');
assert.equal(objA.key,'testA');
assert.equal(objB.key,'');

serverA.addPeer(serverB);
serverB.addPeer(serverA);

assert.equal(objB.key,'testA');
objB.set('key','testB');
assert.equal(objB.key,'testB');
assert.equal(objA.key,'testB');

var serverC = new Swarm();
var clientC = new Swarm(serverC);

serverC.addPeer({
    open : function () {
        setTimeout(function(){
            serverB.open();
        },100);
    },
    apply : function () {
        setTimeout(function(){
            serverB.apply();
        },100);
    }
});

var objC = clientC.open(new Obj(objA._id));
setTimeout(function(){
    assert.equal(objC.key,'testB');
},120);*/
