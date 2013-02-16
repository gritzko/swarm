function isEqual (a,b) {
    if (a!=b)
        console.trace('expected',b,'got',a);
};

if (typeof(require)=='function')
    Peer = require('../lib/swarm.js');

function Obj (id) {
    this._id = id;
    this.key = '';
    this._lstn = [];
}
Peer.extend(Obj);


/*var port = process.argv[2];
var hubPort = process.argv[3];
console.log('swarm peer starts at port',port);
swarm.listen({port:port});
if (hubPort)
    swarm.connectPeer('ws://localhost:'+hubPort);

var obj = swarm.on('/Obj#id',function(change){
	console.log(change);
});

var i=0;

setInterval(function(){
	if (i++&1)
		obj.set('key',port);
},1000);
*/	


var swarmA = new Peer('&00-Aa');
var swarmB = new Peer('&00-Bb');
var wrapA = new Peer.JsonSeDe( swarmA, swarmB.id, {
    send : function (str) { wrapB.onMessage(str) }
});
var wrapB = new Peer.JsonSeDe( swarmB, swarmA.id, {
    send : function (str) { wrapA.onMessage(str) }
});
/*wrapA.pipe = {
};
wrapB.pipe = {
};
swarmB.addPeer(wrapA);
swarmA.addPeer(wrapB);*/

function logChange (op) {
    console.trace('\t*',op);
};
// all sync
var objA = swarmA.on(new Obj(),logChange); // most natural form
console.log('\nSWARMA\n',swarmA,'\nSWARMB\n',swarmB);
var objB = swarmB.on(new Obj(objA._id),logChange);

isEqual(objA.key,'');
objA.set('key','testA');
isEqual(objA.key,'testA');
isEqual(objB.key,'');

isEqual(objB.key,'testA');
objB.set('key','testB');
isEqual(objB.key,'testB');
isEqual(objA.key,'testB');


/*var serverC = new swarm();
var clientC = new swarm(serverC);

serverC.addPeer({
    open : function () {
        setTimeout(function(){
            swarmB.open();
        },100);
    },
    apply : function () {
        setTimeout(function(){
            swarmB.apply();
        },100);
    }
});

var objC = clientC.open(new Obj(objA._id));
setTimeout(function(){
    isEqual(objC.key,'testB');
},120);*/
