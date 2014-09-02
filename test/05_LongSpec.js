"use strict";

var env = require('../lib/env');
var Spec = require('../lib/Spec');
var LongSpec = require('../lib/LongSpec');
var Host = require('../lib/Host');

test('5._ unicode (base 2^15) numbers', function (test) {
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

test('5.0 constructor', function (test){
    var ls = new LongSpec('/ab#cd!ef+gh');
    ls.add('.ij');
    var str = ls.toString();
    equal(str, '/ab#cd!ef+gh.ij');
});

test('5.1 encode/decode', function (test){
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

test('5.2 find & partials', function (test){
    var ambils = new LongSpec('!one#two.three/TimesTwo.three.the#end');
    var the = ambils.find('.the');
    var three = ambils.find('.three');
    var three2 = ambils.find('.three',three);
    var none = ambils.find('.Ti');
    ok(the!==-1);
    ok(three!==-1);
    equal(none,-1);
    ok( the > three );
    ok( three < three2 );
    equal(three2, 8);
    /* a really long one
    for(var i;;) {
        ls.push(tok);
    }
    ls.find('.ab');*/
});

test('5.3 edits and O(n)', function (test){
    var count = 4;
    var longls = new LongSpec(), i = null;
    for(var i=0; i<count; i++)
        longls.append('.a');
    var at = -1;
    while ( -1 !== (at = longls.find('.a',at+1)) && count--) {
        longls.insertAfter('.bcdef',at);
    }
    var spec = longls.toString();
    equal(spec, '.a.bcdef.a.bcdef.a.bcdef.a.bcdef');
});

test('5.4 matching and iteration', function (test){
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

test('5.5 mass encode/decode', function (test) {
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
