var swarm = require('./swarm.js');
var Swarm = swarm.Swarm;
var LocalPeer = swarm.LocalPeer;
var assert = require('assert');

function Obj () {
    this.key = '';
}

var serverA = new Swarm('&Aa');
var serverB = new Swarm('&Bb');

var clientA = new Swarm(serverA);
var clientB = new Swarm(serverB);

// all sync
var objA = clientA.open(Obj);
var objB = clientB.open(Obj,objA._id);

objA.set('key','testA');
assert.equal(objA.key,'');
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

var objC = clientC.open(Obj,objA._id);
setTimeout(function(){
    assert.equal(objC.key,'testB');
},120);
