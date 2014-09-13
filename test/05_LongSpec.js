"use strict";

var env = require('../lib/env');
var Spec = require('../lib/Spec');
var LongSpec = require('../lib/LongSpec');
var Host = require('../lib/Host');
//var MinutePreciseClock = require('../lib/MinutePreciseClock');

test('5.a unicode (base 2^15) numbers', function (test) {
    // encode
    var numf = Spec.base2int('ABCDE'); // 6*6 = 36 bit, 3 uni
    var num = (0xE) + (0xD<<6) + (0xC<<12) + (0xB<<18) + (0xA<<24);
    var suffix = 0xf;
    equal(numf,num);
    var uni = String.fromCharCode(0x30+(numf>>15), 0x30+(numf&0x7fff));
    var unif = LongSpec.int2uni(numf);
    equal(unif,uni);
    // decode
    var de = LongSpec.uni2int(unif);
    equal(de,numf);

    for(var i=0; i<=0x7fff; i++) {
        var u = LongSpec.int2uni(i);
        var i2 = LongSpec.uni2int(u);
        if (i!==i2) { equal(i,i2); }
    }
});

test('5.b constructor', function (test){
    var ls = new LongSpec('/ab#cd!ef+gh');
    ls.add('.ij');
    var str = ls.toString();
    equal(str, '/ab#cd!ef+gh.ij');
});

test('5.c1 encode - sequences', function (test){

    var ls = new LongSpec('#unencodeable#unencodeable#unencodeable');
    equal(ls.chunks[0],'#unencodeable##')

    var book = {en:{'.on':'.0','+ext':'+e'}};
    var repeats = new LongSpec('.on.on.on.on.on.on.on.on.on.on', book);
    equal(repeats.chunks[0], '.0.........');

    var numbers = new LongSpec('!shrt1!shrt2!shrt3');
    var uni = LongSpec.int2uni(Spec.base2int('shrt1'));
    equal(numbers.chunks[0], '!'+uni+'!!');

    var exts = new LongSpec('!shrt1+ext!shrt2+ext!shrt3+ext', book);
    equal(exts.chunks[0], '!'+uni+'+e!!');

    var longs = new LongSpec('#longnum001#longnum002');
    equal(longs.chunks[0].length, 6);

});

test('5.c3 general encode/decode', function (test){
    var codeBook = {
        en : {
            '/Mouse': '/M',
            '.on':    '.o',
            '.off':   '.f',
            '#Mickey':'#i'
        }
    };
    var spec1 = '/Mouse#Mickey!abcde.on';
    var ls1 = new LongSpec(spec1,codeBook);
    equal(ls1.chunks[0],'/M#i!\u4b64\u7a59.o');
    equal(spec1,ls1.toString());

    var spec2 = '/Mouse#Mickey!bcdef.off';
    var ls2 = new LongSpec(spec2,codeBook);
    equal(ls2.chunks[0],'/M#i!\u4d6d\u0a9a.f');
    equal(spec2,ls2.toString());

    var spec3 = '/Mouse#abcde.off';
    var ls3 = new LongSpec(spec3,codeBook);
    equal(ls3.chunks[0],'/M#\u4b64\u7a59.f');
    equal(spec3,ls3.toString());

    var zeros5 = new LongSpec('.00000');
    equal(zeros5.toString(),'.00000');

    var zeros7 = new LongSpec('.0000001');
    equal(zeros7.toString(),'.0000001');

});

test('5.d find & partials', function (test){
    var ambils = new LongSpec('!one!two.three/TimesTwo.three.the#end+it~is~not#end');
    var the = ambils.find('.the');
    equal(the.index,5);
    var three = ambils.find('.three');
    ok(three.index,2);
    var three2 = ambils.find('.three',three.index+1);
    equal(three2.index, 4);
    var none = ambils.find('.Ti');
    ok(none.end()); // FIXME make foolproof
    var last = ambils.find('#end');
    equal(last.index,7);
});

test('5.e edits and O(n)', function (test){
    var count = 4; // inf loop protection
    var longls = new LongSpec();
    for(var i=0; i<count; i++) {
        longls.append('.bc');
    }
    var at;
    while ( (at = longls.find('.bc',at?at.index+1:at)) && count--) {
        at.insert('.a');
    }
    var spec = longls.toString();
    equal(spec, '.a.bc.a.bc.a.bc.a.bc');
});


/*test('5.g mass encode/decode', function (test) {
    var epoch = 1262275200000; // TODO move to Spec
    var time = ((new Date().getTime()-epoch)/1000)|0;
    for(var i=0; i<100; i++) {
        var t = time + i;
        var ts = Spec.int2base(t);
        var spec = '/Test#05LongSpec!'+ts+'.on';
        var enc = new LongSpec(spec);
        var dec = enc.toString();
        equal(spec,dec);
    }
});

test('5.h Array-like API', function(test) {
    var ls = new LongSpec('!one#two#two+andahalf.three/four4');
    var three = ls.itemAt(3);
    equal(three,'.three');
    var i = ls.indexOf('/four4');
    equal(i,4);
    var j = ls.indexOf('#two+andaquarter');
    equal(j,-1);
    var at = ls._at(1);
    equal(ls.decode(at.en), '#two');
    ls.splice(1,3,'.23');
    equal(ls.toString(),'!one.23/four4');
});*/

test('5.i Iterator', function(test) {
    var ls = new LongSpec('!one#two.three/four4');
    var i = ls.iterator();
    equal(i.token(),'!one');
    i.next();
    equal(i.token(),'#two');

    var e = ls.iterator();
    e.skip(3);
    equal(e.token(),'/four4');
    e.next();
    ok(e.end());
    equal(e.token(),undefined);

    var e300 = ls.iterator();
    e300.skip(300);
    ok(e300.end());
    equal(e300.token(),undefined);

    var lx = new LongSpec('!one#two.three/four4');
    var x = lx.iterator();
    x.skip(1);
    x.erase(2);
    equal(lx.toString(),'!one/four4'); // 10

    var j = ls.iterator(); // still !one#two.three/four4
    j.skip(2);
    equal(j.token(),'.three');
    j.erase(2);
    equal(j.index,2); // eof
    j.insert('#two+andahalf');
    equal(j.index,3);
    equal(ls.length(),3);
    equal(ls.toString(),'!one#two#two+andahalf');

    var k = ls.iterator();
    k.skip(2);
    equal(k.token(),'#two+andahalf');

    var l = ls.iterator(); // !one#two#two+andahalf
    equal(l.index,0);
    l.insert('/zero');
    equal(ls.length(),4);
    equal(l.token(),'!one');
    equal(l.index,1);

    var empty = new LongSpec();
    var ei = empty.iterator();
    ok(ei.end());
    ei.insert('!something+new'); // FIXME throw on format violation
    equal(empty.toString(), '!something+new');
});

test('5.j Sequential compression', function(test) {
    var ls = new LongSpec('!00abc!00abd!00abe!00abf');
    var i = ls.end();
    i.insertBlock('!00abg!00abh!00abi');
    equal(ls.length(),7);
    ok(ls.charLength()<10);
    var f = ls.find('!00abe');
    equal(f.index,2);
    var v = ls.find('!00abh');
    equal(v.index,5);
    var j = ls.iterator(4);
    equal(j.token(),'!00abg');

    var lse = new LongSpec('!~~~a1+src!~~~a2+src!~~~a3+src');
    var ei = lse.iterator();
    ei.next();
    equal(ei.token(),'!~~~a2+src');
    equal(ei.match[0].length,1);
});

// test TODO   max-uni insert
// test TODO   multiple inserts, iterator wear

/*test('5.7 sequential coding', function (test) {
    var clockContext = {
        maxTimestampSeen: '',
        lastTimestampAssigned: '',
        lastTimeAssigned: '',
        lastSeqAssigned: 0
    };
    Swarm.env.clock = MinutePreciseClock;
    // install minute-precise timestamps
    var ls = new LongSpec();
    var seqs = [];
    for(var i=0; i<10; i++) {
        var time = seqs.push(Swarm.env.clock.timestamp(clockContext));
        var id = '!' + time + '+somehost';
        seqs[i] = id;
    }
    for(var i=0; i<10; i++) {
        ls.append(seqs[i]);
    }
    ok(ls.value.length<30);
    var iter = ls.iterator();
    for(var i=0; i<10; i++) {
        ok(iter);
        equal(ls._dicode(iter.en), seqs[i]);
        iter = iter.next();
    }
    ok(iter===undefined);
    var find = ls._find(seqs[3]);
    ok(find);
    var next = find.next();
    equal(ls.decode(next.en), seqs[4]);
    Swarm.env.clock = Swarm.SecondPreciseClock;
});

test('5.8 humane API: insertAfter, Before', function (test){
    var ls = new LongSpec('!one#two.three/four+4');
    ls.insertAfter('#two+andahalf','#two');
    ls.insertBefore('.three','/four+4');
    equal(ls.itemAt(4),'/four+4');
    equal(ls.toString(), '!one#two#two+andahalf.three/four+4');
});*/
