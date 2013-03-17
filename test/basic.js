var test_count = 1;

function isEqual (fact,expect) {
    if (fact!==expect) {
        console.warn(test_count++,'FAIL',expect,fact);
        console.trace();
    } else
        console.log(test_count++,'OK',fact);
};

if (typeof(require)=='function')
    Peer = require('../lib/swarm.js');

function SimpleObject (id) {
    this._id = id;
    this.key = '';
    this._lstn = [];
}
Peer.extend(SimpleObject);

function testSpec () {
    var spec = Spec.parse32('/222a-222a#222a!222a-222a');
    var specf = Spec.filter(spec,'!');
    isEqual(specf.toString(),'!060600');
    var parsed = Spec.parseId(specf);
    isEqual(parsed.seq,'06');
}

/*var port = process.argv[2];
var hubPort = process.argv[3];
console.log('swarm peer starts at port',port);
swarm.listen({port:port});
if (hubPort)
    swarm.connectPeer('ws://localhost:'+hubPort);

var obj = swarm.on('/SimpleObject#id',function(change){
	console.log(change);
});

var i=0;

setInterval(function(){
	if (i++&1)
		obj.set('key',port);
},1000);
*/	

var PEER_SSN_A='01',
    PEER_SSN_B='02',
    PEER_SSN_C='03',
    PEER_SSN_D='04',
    OBJ_ID_A = Spec.parse32('/SimpleObject#A-A-A'),
    OBJ_ID_B = Spec.parse32('/SimpleObject#A-A-B'),
    OBJ_ID_C = Spec.parse32('/SimpleObject#A-A-C');

// redefine hash function
Peer.hash = function (uni_id) {
    var ii = uni_id.indexOf('#');
    if (ii!==-1)
        uni_id = uni_id.substr(ii);
    var p = Spec.parseId(uni_id);
    if (!p)
        throw 'malf id';
    return Spec._uni2int(p.src);
};

function linkPeers (peer1,peer2) {
    var mock1 = {
        send : function (str) { mock2.cb(str) },
        on : function (evmsg, cb) {
            this.cb = cb;
            this.q = this.q.reverse();
            while (x=this.q.length)
                cb.apply(this,this.q.pop());
        },
        q : [],
        cb : function () { this.q.push(arguments); }
    };
    var mock2 = {
        send : function (str) { mock1.cb(str) },
        on : function (evmsg, cb) { this.cb = cb; },
        on : function (evmsg, cb) {
            this.cb = cb;
            this.q = this.q.reverse();
            while (x=this.q.length)
                cb.apply(this,this.q.pop());
        },
        q : [],
        cb : function () { this.q.push(arguments); }
    };
    var sede1 = new Peer.JsonSeDe( peer1, peer2.id, mock1 );
    var sede2 = new Peer.JsonSeDe( peer2, peer1.id, mock2 );
}

function unlinkPeers (peer1,peer2) {
    peer1.removePeer(peer2);
    peer2.removePeer(peer1);
}

function logChange (op,obj) {
//    console.log(obj._host.id,obj._id,op);
}

function testBasicSetGet () {
    console.log('testBasicSetGet');
    var peerA = new Peer(PEER_SSN_A);
    var peerB = new Peer(PEER_SSN_B);
    linkPeers(peerA,peerB);
    var objA = peerA.on(new SimpleObject(),logChange); // most natural form
    var objB = peerB.on(new SimpleObject(objA._id),logChange);
    isEqual(objA.key,'');
    objA.set('key','testA');
    isEqual(objA.key,'testA');
    isEqual(objB.key,'testA');
    objB.set('key','testB');
    isEqual(objB.key,'testB');
    isEqual(objA.key,'testB');
    peerB.off(objA._id,logChange);
    isEqual(peerB.objects[objA._id],undefined);
    unlinkPeers(peerA,peerB);
    peerA.close();
    peerB.close();
}

function testOpenPush () {
    console.log('testOpenPush');
    var peerA = new Peer(PEER_SSN_A);
    var peerB = new Peer(PEER_SSN_B);
    var objA = peerA.on
        (new SimpleObject(peerB.createOid(SimpleObject)), logChange);
    objA.set('key','A');
    linkPeers(peerA,peerB);
    var objB = peerB.objects[objA._id];
    isEqual(objB && objB.key,'A');
    peerA.close();
    peerB.close();
}

function testOpenPull () {
    console.log('testOpenPull');
    var peerA = new Peer(PEER_SSN_A);
    var peerB = new Peer(PEER_SSN_B);
    var objA = peerA.on(new SimpleObject(),logChange);
    objA.set('key','A');
    linkPeers(peerA,peerB);
    var objB = peerB.on(objA._id,logChange);
    isEqual(objB.key,'A');
    peerA.close();
    peerB.close();
}

function testUplinkPush () {
    console.log('testUplinkPush');
    var peerA = new Peer(PEER_SSN_A);
    var peerB = new Peer(PEER_SSN_B);
    var peerC = new Peer(PEER_SSN_C);
    var idC = peerC.createOid(SimpleObject);
    var objA = peerA.on(idC,logChange);
    var objB = peerB.on(idC,logChange);
    objA.set('key','A');
    isEqual(objA.key,'A');
    isEqual(objB.key,'');
    linkPeers(peerA,peerB);
    isEqual(objB.key,'A');
    linkPeers(peerC,peerA);
    linkPeers(peerC,peerB);  // TODO immediate pex
    // must rebalance the tree, open the obj
    var objC = peerC.objects[idC];
    isEqual(objC&&objC.key,'A');
    unlinkPeers(peerC,peerA); // TODO dead trigger;  peerC.close() instead
    unlinkPeers(peerC,peerB);
    isEqual(peerC.objects[idC],undefined);
    // must readjust after the disconnection
    objB.set('key','B');
    isEqual(objA.key,'B');
    peerA.close();
    peerB.close();
    peerC.close();
}

function testMergeSync () {
    console.log('testMergeSync');
    var peerA = new Peer(PEER_SSN_A);
    var peerB = new Peer(PEER_SSN_B);
    var objA = peerA.on(SimpleObject,logChange);
    var objB = peerB.on(objA._id,logChange);
    objA.set('key','A');
    objB.set('key2','B');
    linkPeers(peerA,peerB);
    isEqual(objB.key,'A');
    isEqual(objB.key2,'B');
    isEqual(objA.key2,'B');
    isEqual(objA.key,'A');
    peerA.close();
    peerB.close();
}

function testChaining () {
    console.log('testChaining');
    var peerA = new Peer(PEER_SSN_A);
    var peerB = new Peer(PEER_SSN_B);
    var peerC = new Peer(PEER_SSN_C);
    var peerD = new Peer(PEER_SSN_D);
    linkPeers(peerA,peerB);
    linkPeers(peerC,peerB);
    linkPeers(peerC,peerD);
    var idC = peerC.createOid(SimpleObject);
    var objA = peerA.on(idC,logChange);
    var objD = peerD.on(idC,logChange);
    objA.set('key','A');
    isEqual(objD.key,'A');
    objD.set('key','D');
    isEqual(objA.key,'D');
    isEqual(objA._vmap,objD._vmap);
    var objB = peerB.on(idC,logChange);
    objB.set('key','B');
    isEqual(objD.key,'B');
    peerA.close();
    peerB.close();
    peerC.close();
    peerD.close();
}


testSpec();

testBasicSetGet();

testOpenPull();
testOpenPush();
testUplinkPush();

testMergeSync();
testChaining();
