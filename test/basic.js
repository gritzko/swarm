function isEqual (fact,expect) {
    if (fact!=expect) {
        console.warn('expected',expect,'got',fact);
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

var spec = '/2222-2222#2222!2222-2222';
var specf = Peer.filter(spec,'!');
isEqual(specf,'!2222-2222');

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

function linkPeers (peer1,peer2) {
    var mock1 = {
        send : function (str) { mock2.cb(str) },
        on : function (evmsg, cb) { this.cb = cb; }
    };
    var mock2 = {
        send : function (str) { mock1.cb(str) },
        on : function (evmsg, cb) { this.cb = cb; }
    };
    var sede1 = new Peer.JsonSeDe( peer1, peer2.id, mock1 );
    var sede2 = new Peer.JsonSeDe( peer2, peer1.id, mock2 );
}

function unlinkPeers (peer1,peer2) {
    peer1.removePeer(peer2);
    peer2.removePeer(peer1);
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
    objB = peerB.objects[OBJ_ID_B];
    isEqual(objB && objB.key,'A');
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
    isEqual(objC&&objC.key,'A');
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

testUplinkPush();

testMergeSync();
