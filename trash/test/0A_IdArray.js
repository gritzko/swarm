"use strict";

var Spec = require('../lib/Spec');
var IdArray = require('../lib/IdArray');
var SecondPreciseClock = require('../lib/SecondPreciseClock');

test('A.a init', function(test){
    var v1 = '!abcdefg+joe~ssn';
    var v2 = 'abcdehe+joe~ssn';
    var v3 = 'abcdf+joe~ssn';
    var arr = new IdArray([v1,v2,v3]);
    equal(arr.body.length,7); // TODO 6
    equal(arr.at(0),v1.substr(1));
    equal(arr.at(1),v2);
    equal(arr.at(2),v3);

    var limits = new IdArray();
    limits.push("!~~~~~+eternity");
    limits.push("!~~~~~"+Spec.MAX_SEQ+"+eternity");
    limits.push("!00000+big~bang");
    limits.push("!0000000+big~bang");
    limits.push('!0');
    equal(limits.at(0),"~~~~~+eternity");
    equal(limits.at(1),"~~~~~"+Spec.MAX_SEQ+"+eternity");
    equal(limits.at(2),"00000+big~bang");
    equal(limits.at(3),"00000+big~bang"); // 00 is eaten!
    equal(limits.at(4),"0");

});

test('A.b sequence compression', function(test){
    var arr = new IdArray();
    // seqs
    arr.insert("!00fA2se+john~doe");
    arr.insert("!00fA2sf+john~doe",1);
    arr.insert("!00fA2sg+john~doe",2);
    equal(arr.body.length,6);
    equal(arr.at(2),"00fA2sg+john~doe");
    // ts es
    arr.push("!00fA3+jane~doe");
    arr.push("!00fA5+jane~doe");
    equal(arr.body.length,12); // TODO 11
    equal(arr.at(4),"00fA5+jane~doe");
    equal(arr.pop(),"00fA5+jane~doe");
    equal(arr.length(),4); // #6
    /* ts inc
    arr.push("!00fA601+jane~doe");
    arr.push("!00fA7+jane~doe"); */

    // ts leap
    var arr2 = new IdArray();
    arr2.push("!00fA3+jane~doe");
    arr2.push("!00hzq+jane~doe");
    equal(arr2.length(),2);
    equal(arr2.body.length,6);
    equal(arr2.at(1),"00hzq+jane~doe");
});


test('A.c insertion', function(test){
    var arr = new IdArray();
    var time = 'equal', src = '+shuffle';
    var amount = 1<<11;
    function seqid (seq) {
        return time + (seq?Spec.int2base(seq,2):'') + src;
    }
    arr.insert(seqid(0),0);
    for(var step=amount, count=2; step>1; step>>=1, count<<=1) {
        for(var n=1, seq=step>>1; n<count; n+=2, seq+=step) {
            var id = seqid(seq);
            arr.insert(id,n);
        }
    }
    for(var i=0; i<amount; i++) {
        equal(arr.at(i), seqid(i));
    }
    equal(arr.body.length,amount+3); // 4 chars for the first entry
});


test('A.d removal', function(test){
    var time = new SecondPreciseClock('remove~test');
    var arr = new IdArray();
    var ids = [];
    for(var i=0; i<1000; i++) {
        time.clockOffsetMs += Math.round(Math.random()*10000);
        var id = time.issueTimestamp();
        arr.push(id);
        ids.push(id);
    }
    for(var j=0; j<1000; j++) {
        equal(arr.at(j), ids[j]);
    }
    console.log("A.d chars per id ",1.0*arr.body.length/arr.length());
    arr.remove(0,10);
    equal(arr.at(0),ids[10]);
    arr.remove(10,10);
    equal(arr.at(10),ids[30]);
    equal(arr.at(9),ids[19]);
    arr.remove(1000-10-20,10);
    equal(arr.at(1000-30-1),ids[1000-10-1]);
});


asyncTest('A.e random data', function(test){
    var alice = new SecondPreciseClock('Alice~1');
    var bob = new SecondPreciseClock('Bob~2');
    var arr = new IdArray();
    var ids = [];
    var length = 400;
    var ai = setInterval(function(){
        alice.clockOffsetMs = bob.clockOffsetMs;
        var id = alice.issueTimestamp();
        ids.push(id);
        arr.push(id);
        if (--length<=0) {
            clearInterval(ai);
            ai = 0;
            verify();
        }
    }, 3);
    var bi = setInterval(function(){
        bob.clockOffsetMs += 256;
        var id = bob.issueTimestamp();
        ids.push(id);
        arr.push(id);
        if (--length<=0) {
            clearInterval(bi);
            bi = 0;
            verify();
        }
    }, 17);

    function verify () {
        if (ai!==0 || bi!==0) { return; }
        for(var i=0; i<ids.length; i++) {
            equal(ids[i],arr.at(i));
        }
        console.log("A.e chars per id ",1.0*arr.body.length/arr.length());
        start();
    }

});

test('A.e2 remix', function(test){
    var arr = new IdArray();
    var ids = [];
    var time = 'remix', src = '+shuffle';
    var amount = 1<<10;
    function seqid (seq) {
        return time + (seq?Spec.int2base(seq,2):'') + src;
    }
    for(var i=0; i<amount; i++) {
        var id = seqid(i);
        ids.push(id);
        arr.push(id);
    }
    for(var k=0; k<100; k++) {
        var from=Math.floor(Math.random()*amount);
        var to=Math.floor(Math.random()*(amount-1));
        var someid = arr.at(from);

        arr.remove(from);
        arr.insert(someid,to);

        var count = 0, factlen = 0;
        for(var j=arr.iterator(); j.match; j.next()) {
            factlen++;
            if (j.base64id()===someid) {
                count++;
            }
        }
        equal(count,1);
        equal(factlen,1024);

    }
    var ids2 = [];
    for(var iter=arr.iterator(); !iter.end(); iter.next()) {
        ids2.push(iter.base64id());
    }
    ids2.sort();
    equal(ids.join(),ids2.join());
});

/*test('A.f search', function(test){
    var arr = new IdArray();
    // random (remember pos)
    for(var ts in tspos) {
        var i = arr._find(ts);
        equal(i.offset,tspos[ts]);
        equal(arr._decode(i.match),tspos[ts]);
    }
    for(var ts in tspos) {
        var pos = arr.find(ts);
        equal(pos,tspos[ts]);
    }
});
*/

test('A.g splice', function(test){
    var a = new IdArray([
        'time1+john',
        'time2+jane',
        'time0+jack'
    ]);
    var i = a.iterator(1);
    equal(i.base64id(),'time2+jane');
    a._splice(i,2,[a.encoder.encode('time3+joe')]);
    equal(a.toString(),'time1+john,time3+joe');
    equal(i.pos,2);
    ok(i.end());

    a.push('timeG+jean');
    var j = a.iterator();
    equal(j.base64id(),'time1+john');
    a._splice(j,1,[
        a.encoder.encode('time4+jay'),
        a.encoder.encode('timeF+jacques')
    ]);
    equal(j.base64id(),'time3+joe');
    equal(j.pos,2);

    var j2 = j.clone();
    equal(j2.base64id(),'time3+joe');
    j2.next();
    equal(j2.base64id(),'timeG+jean');
    j2.next();
    ok(j2.end());

    a._splice(j,0);
    equal(j.base64id(),'time3+joe');
    equal(a.toString(),'time4+jay,timeF+jacques,time3+joe,timeG+jean');
    j.next();
    equal(j.base64id(),'timeG+jean');
    j.next();
    ok(j.end());
});


test('A.h uncompressed', function (test){
    var un = new IdArray.Uncompressed();
    un._push('aaaa');
    un._push('bbbb');
    un._push('ccaa');
    un._push('aadd');
    un._push('aaaa');
    equal(un.body,'aaaabbbbccaaaaddaaaa');
    equal(un._at(3),'aadd');
    var i = un._find('aaaa');
    equal(i.pos,0);
    un._splice(i,2,'bbbbaaaa');
    var i2 = un._find('aaaa',1);
    equal(i2.pos, 1);
    var i3 = un._find('aaaa',2);
    equal(i3.pos, 4);

    var base = new IdArray.Uncompressed();
    base.push('time1+src1');
    base.push('time2+src2');
    base.push('time3+src3');
    base.push('time4+src4');
    base.splice(1,2,['time5+src5']);
    equal(base.at(1), 'time5+src5');
    equal(base.at(2), 'time4+src4');
});
