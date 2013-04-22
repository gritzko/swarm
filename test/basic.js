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
    this._id = id||'';
    this.key = '';
    this.key2 = '';
    this._lstn = [];
    this._vmap = '';
}
Peer.extend(SimpleObject,'/SmpObj');
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
    isEqual(s.id,spec[1].cache);
    for(var i=0; i<spec.length; i++)
        back32.push(spec[i].q,spec[i].toString32());
    isEqual(back32.join(''),spec32.join(''));
    isEqual(s.toString32(),spec32.join(''));

    
    Spec.addWireName('Mouse','/_Mouse');
    var mickey = new Spec('Mouse');
    isEqual(mickey.toString(),'/_Mouse');
}

function Mouse () {
    this.x = this.y = 0;
};

function testSigs () {    
    Peer.extend (Mouse, '/_Mouse', {
        x: '.coordx',
        y: '.coordy'
    });
    isEqual(Mouse.prototype._type.toString(),'/_Mouse');
    var peer = new Peer(PEER_ID_A);
    var x;
    var specPref = '/_Mouse#mickey';
    var mickey = peer.on('/_Mouse#mickey');
    mickey.on('',function inc(spec,val){
        isEqual(spec.toString().substr(0,specPref.length), specPref);
        isEqual(val['.coordx'],x);
    });
    // move Mickey!
    mickey.set('x', x=10);
    // TODO default peer(FIXME _host)  Mouse.set('#mickey.coordx', 11);
    mickey.set({x: x=12}); 
    mickey.set('x',x=13);
    mickey.setX(x=14); 
    peer.set("#mickey", {x: x=15});
        // #mickey should be open already, otherwise:
    peer.set('/_Mouse#mickey.coordx', x=16);
        // that was a blind write
    mickey.set({'.coordx': x=17});
}

function testEvents ( ) {
    var obj = new SimpleObject();
    var val = 0, fval;
    function valpub(spec,v){
        val = v;
    }
    obj.on('',valpub);
    obj.setKey(1);
    isEqual(val.key,1);
    obj.set('key','%c \u00a7\ttest');
    isEqual(val.key,'%c \u00a7\ttest');
    obj.set('.===key','id');
    isEqual(val.key,'id');
    // filtered events
    obj.on('key',{
        set : function (spec,val) {
            fval = val.key;
        }
    });
    obj.set('key','hit');
    obj.set('key2','miss');
    isEqual(val.key2,'miss');
    isEqual(fval,'hit');
    obj.off('',valpub);
    obj.set('key','off');
    isEqual(val.key2,'miss');
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
    var obj = peer.on('/SmpObj'); //SimpleObject);
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
    isEqual(val.key,123);
    // ...objB is not
    objB.setKey(321);
    isEqual(objB.key,321);
    isEqual(obj.key,123);
    isEqual(val.key,123);
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

var PEER_ID_A=new ID('#',0,17),
    PEER_ID_B=new ID('#',0,18),
    PEER_ID_C=new ID('#',0,19),
    PEER_ID_D=new ID('#',0,20);

// redefine hash function
Peer.hash = function (id) {
    id = ID.as(id);
    return id.ts;
};


function logChange (op,obj) {}

function testBasicSetGet () {
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    peerA.addPeer(peerB);
    peerB.addPeer(peerA);
    var objA = peerA.on(SimpleObject,logChange); // most natural form
    var objB = peerB.on(new SimpleObject(objA._id));
    isEqual(objA.key,'');
    objA.set('key','%c \u00a7\ttestA');
    isEqual(objA.key,'%c \u00a7\ttestA');
    isEqual(objB.key,'%c \u00a7\ttestA');
    objB.set('key','%c \u00a7\ttestB');
    isEqual(objB.key,'%c \u00a7\ttestB');
    isEqual(objA.key,'%c \u00a7\ttestB');
    peerB.off(objB);
    //peerB.gc();
    isEqual(peerB._lstn[objA._id],undefined);
    //unlinkPeers(peerA,peerB);
    peerA.close();
    peerB.close();
}

function testOpenPush () {
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var objA = peerA.on (SimpleObject, logChange);
    objA.set('key','A');
    peerA.addPeer(peerB);
    peerB.addPeer(peerA);
    var objB = peerB.on(objA._type+objA._id);
    isEqual(objB && objB.key,'A');
    peerA.close();
    peerB.close();
}

function testOpenPull () {
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var objA = peerA.on(SimpleObject,logChange);
    objA.set('key','A');
    peerA.addPeer(peerB);
    peerB.addPeer(peerA);
    var objB = peerB.on(''+objA._type+objA._id,logChange);
    isEqual(objB.key,'A');
    peerA.close();
    peerB.close();
}

function linkPeers (a,b) {
    //a.addPeer(b);
    //b.addPeer(a);
    var pair = getTestSocketPair();
    var pipea = new Pipe(pair[0],b);
    var pipeb = new Pipe(pair[1],a);
    //pipea.timer = pipeb.timer = true; // block
    //b.addPeer(pipea);
    //a.addPeer(pipeb);
    //pipea.timer = pipeb.timer = undefined;
    //pipea.set();
    //pipeb.set();
}
function unlinkPeers (a,b) {
    //a.removePeer(b);
    //b.removePeer(a);
    b.removePeer(a._id||a);
    a.removePeer(b._id||b);
}

function testUplinkPush () {
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var peerC = new Peer(PEER_ID_C);
    var objA = peerA.on(SimpleObject,logChange);
    var idC = objA._id;
    var objB = peerB.on(objA._type+objA._id,logChange);
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
    var objC = peerC.on(objA._type+idC);
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
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var objA = peerA.on(SimpleObject,logChange);
    var objB = peerB.on(objA._type+objA._id,logChange);
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
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);
    var peerC = new Peer(PEER_ID_C);
    var peerD = new Peer(PEER_ID_D);
    linkPeers(peerA,peerB);
    linkPeers(peerB,peerC);
    linkPeers(peerC,peerD);
    var idC = SimpleObject.prototype._type + peerC.createId('#');
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

function Mice () {
}
Peer.extendSet(Mice);

function testSet () {
    var peerA = new Peer(PEER_ID_A);
    var peerB = new Peer(PEER_ID_B);

    var listA = peerA.on(Mice);
    var listB = peerB.on(listA.spec());

    listA.set('.mickey',true);
    listB.set('.mighty',true);
    isEqual( listA['.mickey'], true );
    isEqual( listB['.mighty'], true );

    linkPeers(peerA,peerB);

    isEqual( listB['.mickey'], true );
    isEqual( listA['.mighty'], true );

    listA.set('.fatrat','is here by mistake');
    isEqual(listB['.fatrat'],'is here by mistake');

    listA.set('.mickey',null);  // TODO garbage accumulation - both in the set and its vmap

    peerA.close();
    peerB.close();
    
}

function runTest (fn) {
    console.log('%c\u00a7\t'+fn.name,'font-weight: bold; color: #004; font-size: 140%; ');
    fn();
}

runTest(testNewId);
runTest(testNewSpec); 

runTest(testSigs);

runTest(testEvents); 

runTest(testShortCircuit); 

runTest(testLocalObject); 

runTest(testBasicSetGet);

runTest(testOpenPull);
runTest(testOpenPush);
runTest(testUplinkPush);

runTest(testMergeSync);
runTest(testChaining);
runTest(testSet);
