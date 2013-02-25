function isEqual (a,b) {
    if (a!=b) {
        console.warn('expected',b,'got',a);
        console.trace();
    }
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

var PEER_ID_A='&AA',
    PEER_ID_B='&BB',
    PEER_ID_C='&CC',
    OBJ_ID_A='',
    OBJ_ID_B='',
    OBJ_ID_C='';

function linkPeers (peerA,peerB) {
    var mock1 = {
        send : function (str) { mock2.cb(str) },
        on : function (evmsg, cb) { this.cb = cb; }
    };
    var mock2 = {
        send : function (str) { mock1.cb(str) },
        on : function (evmsg, cb) { this.cb = cb; }
    };
    var sedeA = new Peer.JsonSeDe( peerA, peerB.id, mock1 );
    var sedeB = new Peer.JsonSeDe( peerB, peerA.id, mock2 );
    peerB.addPeer(sedeA);
    peerA.addPeer(sedeB);
}

function logChange (op,obj) {
    console.log(obj._host.id,obj._id,op);
}

function testBasicSetGet () {
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    linkPeers(peerA,peerB);
    var objA = peerA.on(new Obj(),logChange); // most natural form
    var objB = peerB.on(new Obj(objA._id),logChange);
    isEqual(objA.key,'');
    objA.set('key','testA');
    isEqual(objA.key,'testA');
    isEqual(objB.key,'testA');
    objB.set('key','testB');
    isEqual(objB.key,'testB');
    isEqual(objA.key,'testB');
    unlinkPeers(peerA,peerB);
    peerA.close();
    peerB.close();
}

function testOpenPush () {
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var objA = peerA.on(new Obj(OBJ_ID_B),logChange);
    objA.set('key','A');
    linkPeers(peerA,peerB);
    isEqual(objB.key,'A');
    peerA.close();
    peerB.close();
}

function testOpenPull () {
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var objA = peerA.on(new Obj(OBJ_ID_A),logChange);
    objA.set('key','A');
    linkPeers(peerA,peerB);
    var objB = peerB.on(new Obj(OBJ_ID_A),logChange);
    isEqual(objB.key,'A');
    peerA.close();
    peerB.close();
}

function testUplinkPush () {
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var objA = peerA.on(new Obj(OBJ_ID_C),logChange);
    var objB = peerB.on(new Obj(OBJ_ID_C),logChange);
    objA.set('key','A');
    isEqual(objA.key,'A');
    isEqual(objB.key,'');
    linkPeers(peerA,peerB);
    isEqual(objB.key,'A');
    var peerC = new Peer(PEER_ID_C);
    linkPeers(peerC,peerA);
    linkPeers(peerC,peerB);  // TODO immediate pex
    // must rebalance the tree, open the obj
    var objC = peerC.objects[OBJ_ID_C];
    isEqual(objC.key,'A');
    unlinkPeers(peerC,peerA); // TODO dead trigger;  peerC.close() instead
    unlinkPeers(peerC,peerB);
    // must readjust after the disconnection
    objB.set('key','B');
    isEqual(objA.key,'B');
    peerA.close();
    peerB.close();
    peerC.close();
}

function testMergeSync () {
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var objA = peerA.on(new Obj(OBJ_ID_B),logChange);
    var objB = peerB.on(new Obj(OBJ_ID_B),logChange);
    objA.set('key','A');
    linkPeers(peerA,peerB);
    isEqual(objB.key,'A');
    peerA.close();
    peerB.close();
}


testBasicSetGet();

testOpenPull();
testOpenPush();

testUplinkPull();

testMergeSync();
