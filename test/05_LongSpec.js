"use strict";

var env = require('../lib/env');
var Spec = require('../lib/Spec');
var LongSpec = require('../lib/LongSpec');
var Host = require('../lib/Host');
//var MinutePreciseClock = require('../lib/MinutePreciseClock');

test('5.a unicode (base 2^15) numbers', function (test) {
    // encode
    var base64 = 'ABCDEF';
    var numf = Spec.base2int('ABCDE'); // 6*6 = 36 bit, 3 uni
    var num = (0xE) + (0xD<<6) + (0xC<<12) + (0xB<<18) + (0xA<<24);
    var suffix = 0xf;
    equal(numf,num);
    var uni = String.fromCharCode(0x30+(numf>>15), 0x30+(numf&0x7fff));
    var unif = LongSpec.int2uni(numf);
    equal(unif,uni);
    var suff = String.fromCharCode(suffix+0x30);
    equal(LongSpec.base2uni3(base64), uni+suff);
    // decode
    var de = LongSpec.uni3base(uni+suff);
    equal(de,base64);
    equal(LongSpec.uni2base(LongSpec.base2uni2('0')), '0');
});

test('5.b constructor', function (test){
    var ls = new LongSpec('/ab#cd!ef+gh');
    ls.add('.ij');
    var str = ls.toString();
    equal(str, '/ab#cd!ef+gh.ij');
});

test('5.c encode/decode', function (test){
    var codeBook = {
        en : {
            '/Mouse': '/M',
            '.on':    '.o',
            '.off':   '.f',
            '#Mickey':'#i'
        }
    };
    var ls = new LongSpec('',codeBook);

    var spec1 = '/Mouse#Mickey!abcde.on';
    var enc1 = ls.encode(spec1);
    var dec1 = ls.decode(enc1);
    equal(dec1.toString(), spec1);
    equal(enc1.toString(),'/M#i!\u4b64\u7a59.o');

    var spec2 = '/Mouse#Mickey!bcdef.off';
    var enc2 = ls.encode(spec2);
    var dec2 = ls.decode(enc2);
    equal(spec2,dec2);
    equal(enc2,'/M#i!\u4d6d\u0a9a.f');

    var spec3 = '/Mouse#abcde.off';
    var enc3 = ls.encode(spec3);
    var dec3 = ls.decode(enc3);
    equal(spec3,dec3);
    equal(enc3,'/M#\u4b64\u7a59.f');
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
        at.insertDe('.a');
    }
    var spec = longls.toString();
    equal(spec, '.a.bc.a.bc.a.bc.a.bc');
});

/*test('5.f matching and iteration', function (test){
    var lsstr = '/Text#note!abcde.in!bcdefgh+author.rm';
    var ls = new LongSpec(lsstr);
    var pattern = '!=(\\+=)?.=';
    var compiled = LongSpec.compilePattern(pattern);
    var m = ls.findPattern(pattern);
    equal(ls.match(m),'!abcde.in');
    var m2 = ls.findPattern(compiled,m);
    equal(ls.match(m2),'!bcdefgh+author.rm');
    var m3 = ls.findPattern(compiled,m2);
    equal(m3,null);
});

test('5.g mass encode/decode', function (test) {
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
    equal(i.de(),'!one');
    i.next();
    equal(i.de(),'#two');

    var e = ls.iterator();
    e.skip(3);
    equal(e.de(),'/four4');
    e.next();
    ok(e.end());
    equal(e.token(),undefined);
    equal(e.de(),undefined);

    var e300 = ls.iterator();
    e300.skip(300);
    ok(e300.end());
    equal(e300.token(),undefined);
    equal(e300.de(),undefined);

    var lx = new LongSpec('!one#two.three/four4');
    var x = lx.iterator();
    x.skip(1);
    x.erase(2);
    equal(lx.toString(),'!one/four4'); // 10

    var j = ls.iterator(); // still !one#two.three/four4
    j.skip(2);
    equal(j.de(),'.three');
    j.erase(2);
    equal(j.index,2); // eof
    j.insertDe('#two+andahalf');
    equal(j.index,3);
    equal(ls.length(),3);
    equal(ls.toString(),'!one#two#two+andahalf');

    var k = ls.iterator();
    k.skip(2);
    equal(k.de(),'#two+andahalf');

    var l = ls.iterator(); // !one#two#two+andahalf
    equal(l.index,0);
    l.insertDe('/zero');
    equal(ls.length(),4);
    equal(l.de(),'!one');
    equal(l.index,1);

    var empty = new LongSpec();
    var ei = empty.iterator();
    ok(ei.end());
    ei.insertDe('!something+new'); // FIXME throw on format violation
    equal(empty.toString(), '!something+new');
});

/*test('5.j Sequential compression', function(test) {
    var ls = new LongSpec('!abc!abd!abe!abf');
    var i = ls.end();
    i.insert('!abg!abh!abi');
    ok(ls.charSize()<10);
});*/

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
