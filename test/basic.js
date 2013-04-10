var test_count = 1;

function isEqual (fact,expect) {
    if (fact!==expect) {
        console.warn(test_count++,'FAIL',expect,fact);
        console.trace();
    } else
        console.log(test_count++,'OK',fact);
};

if (typeof(require)=='function') {
    Peer = require('../lib/swarm.js');
    Spec = Peer.Spec;
}

function SimpleObject (id) {
    this._id = id;
    this.key = '';
    this.key2 = '';
    this._lstn = [];
    this._vmap = '';
}
Peer.extend(SimpleObject);
SpecValEmitter._debug = true;

function testNewId () {
    var id = new ID('!',16);
    var str = id.toString();
    isEqual(str.substr(4),'0@0');

    var samples = {
        '.wrongcaps': 'wrongcaps',
        '.field_name': 'fieldName',
        '/Class_name': 'ClassName',
        '!old_version': 'old_version'
    };
    for(var base32 in samples) {
        var quant = base32.charAt(0), body = base32.substr(1);
        var meth = ID.parse32(quant,body);
        var now32 = meth.toString32();
        isEqual(now32,samples[base32]);
    }
}

function testNewSpec () {
    var spec32 = ['/ClassName','#object_id','.fieldName','!new_version'];
    var spec = [], back32=[];
    for(var i=0; i<spec32.length; i++) {
        var q = spec32[i].charAt(0), body=spec32[i].substr(1);
        spec.push(ID.parse32(q,body));
    }
    var s = new Spec(spec.join(''));
    isEqual(s.oid,spec[1].cache);
    for(var i=0; i<spec.length; i++)
        back32.push(spec[i].q,spec[i].toString32());
    isEqual(back32.join(''),spec32.join(''));
    isEqual(s.toString32(),spec32.join(''));
}

function testEvents ( ) {
    var obj = new SimpleObject();
    var val = 0, fval;
    function valpub(spec,v){
        val = v;
    }
    obj.on('',valpub);
    obj.setKey(1);
    isEqual(val,1);
    obj.set('key','test');
    isEqual(val,'test');
    obj.set(ID.parse32('.','key'),'id');
    isEqual(val,'id');
    // filtered events
    obj.on('key',{
        set : function (spec,val) {
            fval = val;
        }
    });
    obj.set('key','hit');
    obj.set('key2','miss');
    isEqual(val,'miss');
    isEqual(fval,'hit');
    obj.off('',valpub);
    obj.set('key','off');
    isEqual(val,'miss');
    isEqual(fval,'off');
}


function testShortCircuit () {
    var objA = new SimpleObject();
    var objB = new SimpleObject();
    objA.on('',objB);
    objB.on(objA);
    objA.setKey('1');
    objB.set('key2',2);
    isEqual(objA.key2,2);
    isEqual(objB.key,'1');
    objA.set({
        key: 'key',
        key2: 'key2'
    });
    isEqual(objB.key,'key');
    isEqual(objB.key2,'key2');
}


function testLocalObject () {
    var peer = new Peer(PEER_ID_A);
    var obj = peer.on(SimpleObject);
    var objB = new SimpleObject();
    isEqual(peer.on(obj._id,objB), obj);
    var val;
    peer.on(obj._id,function manual(spec,v) {
        val = v;
    });
    // obj is listened to
    obj.setKey(123);
    isEqual(obj.key,123);
    isEqual(objB.key,123);
    isEqual(val,123);
    // ...objB is not
    objB.setKey(321);
    isEqual(objB.key,321);
    isEqual(obj.key,123);
    isEqual(val,123);
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

var PEER_ID_A=new ID('*',0,17),
    PEER_ID_B=new ID('*',0,18),
    PEER_ID_C=new ID('*',0,19),
    PEER_ID_D=new ID('*',0,20);

// redefine hash function
Peer.hash = function (id) {
    id = ID.as(id);
    return id.ts;
};


function logChange (op,obj) {
//    console.log(obj._host.id,obj._id,op);
}

function testBasicSetGet () {
    console.log('testBasicSetGet');
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    peerA.addPeer(peerB);
    peerB.addPeer(peerA);
    var objA = peerA.on(SimpleObject,logChange); // most natural form
    var objB = peerB.on(new SimpleObject(objA._id));
    isEqual(objA.key,'');
    objA.set('key','testA');
    isEqual(objA.key,'testA');
    isEqual(objB.key,'testA');
    objB.set('key','testB');
    isEqual(objB.key,'testB');
    isEqual(objA.key,'testB');
    peerB.off(objB);
    //peerB.gc();
    isEqual(peerB._lstn[objA._id],undefined);
    //unlinkPeers(peerA,peerB);
    peerA.close();
    peerB.close();
}

function testOpenPush () {
    console.log('testOpenPush');
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var objA = peerA.on (SimpleObject, logChange);
    objA.set('key','A');
    peerA.addPeer(peerB);
    peerB.addPeer(peerA);
    var objB = peerB.on(objA._tid+objA._id);
    isEqual(objB && objB.key,'A');
    peerA.close();
    peerB.close();
}

function testOpenPull () {
    console.log('testOpenPull');
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var objA = peerA.on(SimpleObject,logChange);
    objA.set('key','A');
    peerA.addPeer(peerB);
    peerB.addPeer(peerA);
    var objB = peerB.on(''+objA._tid+objA._id,logChange);
    isEqual(objB.key,'A');
    peerA.close();
    peerB.close();
}

function linkPeers (a,b) {
    a.addPeer(b);
    b.addPeer(a);
}
function unlinkPeers (a,b) {
    a.removePeer(b);
    b.removePeer(a);
}

function testUplinkPush () {
    console.log('testUplinkPush');
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var peerC = new Peer(PEER_ID_C);
    var objA = peerA.on(SimpleObject,logChange);
    var idC = objA._id;
    var objB = peerB.on(objA._tid+objA._id,logChange);
    objA.set('key','A');
    isEqual(objA.key,'A');
    isEqual(objB.key,'');
    peerA.addPeer(peerB);
    peerB.addPeer(peerA);
    isEqual(objB.key,'A');
    peerA.addPeer(peerC);
    peerC.addPeer(peerA);
    peerC.addPeer(peerB);
    peerB.addPeer(peerC);
    // must rebalance the tree, open the obj
    var objC = peerC.on(objA._tid+idC);
    isEqual(objC&&objC.key,'A');
    unlinkPeers(peerC,peerA); // TODO dead trigger;  peerC.close() instead
    unlinkPeers(peerC,peerB);
    //peerC.gc(); TODO
    //isEqual(peerC._lstn[idC],undefined);
    // must readjust after the disconnection
    objB.set('key','B');
    isEqual(objA.key,'B');
    peerA.close();
    peerB.close();
    peerC.close();
}

function testMergeSync () {
    console.log('testMergeSync');
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var objA = peerA.on(SimpleObject,logChange);
    var objB = peerB.on(objA._tid+objA._id,logChange);
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
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var peerC = new Peer(PEER_ID_C);
    var peerD = new Peer(PEER_ID_D);
    linkPeers(peerA,peerB);
    linkPeers(peerB,peerC);
    linkPeers(peerC,peerD);
    var idC = SimpleObject.prototype._tid + peerC.createId('#');
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


testNewId();
testNewSpec();

testEvents();

testShortCircuit();

testLocalObject();

testBasicSetGet();

testOpenPull();
testOpenPush();
testUplinkPush();

testMergeSync();
testChaining();
