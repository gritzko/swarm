"use strict";

var env = require('../lib/env');
var Model = require('../lib/Model');
var Storage = require('../lib/Storage');
var Host = require('../lib/Host');
var Collection = require('../lib/Collection');

var UnicodePoint = Model.extend('UnicodePoint',{
    defaults: {
        name: "",
        code: 0x0
    },
    getChar: function () {return String.fromCharCode(this.code);}
});

var CodePointVector = Collection.Vector.extend("CodePointVector",{

    entryType: UnicodePoint._pt._type,

    toString: function () {
        var ret = [];
        this.vector.forEach(function(v){
            ret.push(String.fromCharCode(v.code));
        });
        return ret.join('');
    }

});

test('C.a vector', function (test) {
    console.warn(QUnit.config.current.testName);
    var storage = new Storage(false);
    var host = new Host('local~Ca',0,storage);
    env.localhost = host;
    var vec = new CodePointVector();
    var R_tail = new UnicodePoint({ // Ɽ
        name: "LATIN CAPITAL LETTER R WITH TAIL",
        code: 0x2C64
    });
    var H_half = new UnicodePoint({ // Ⱶ
        name: "LATIN CAPITAL LETTER HALF H",
        code: 0x2C75
    });
    var A_alpha = new UnicodePoint({ // Ɑ
        name: "LATIN CAPITAL LETTER ALPHA",
        code: 0x2C6D
    });
    var IJ = new UnicodePoint({ // Ĳ
        name: "LATIN CAPITAL LIGATURE IJ",
        code: 0x0132
    });
    vec.push(R_tail);
    equal(vec.toString(),"Ɽ"); // 1
    vec.unshift(IJ);
    equal(vec.toString(),"ĲⱤ"); //2
    vec.push(A_alpha);
    equal(vec.toString(),"ĲⱤⱭ"); //3
    vec.push(H_half);
    equal(vec.toString(),"ĲⱤⱭⱵ"); //4
    vec.push(H_half); // copy
    equal(vec.toString(),"ĲⱤⱭⱵⱵ"); //5
    var pop1 = vec.pop();
    ok(pop1===H_half); //6
    var pop2 = vec.pop();
    ok(pop2===H_half); //7
    equal(vec.toString(),"ĲⱤⱭ"); //8
    var pop3 = vec.shift();
    ok(pop3===IJ); //9
    equal(vec.toString(),"ⱤⱭ"); //10
    vec.remove(1);
    equal(vec.toString(),"Ɽ"); //11
    vec.push(IJ);
    vec.remove(R_tail);
    equal(vec.toString(),"Ĳ"); //12
    vec.unshift(R_tail);
    vec.unshift(H_half);
    vec.push(H_half);
    equal(vec.toString(),"ⱵⱤĲⱵ"); //13
    vec.remove(H_half);
    equal(vec.toString(),"ⱤĲⱵ"); //14
    env.localhost = null;
});

var unicode_math = [
    { code: 0x2227, name: "LOGICAL AND" },
    { code: 0x2203, name: "THERE EXISTS" },
    { code: 0x2200, name: "FOR ALL" },
    { code: 0x221E, name: "INFINITY" },
    { code: 0x2211, name: "N-ARY SUMMATION" },
    { code: 0x2208, name: "ELEMENT OF" },
    { code: 0x2209, name: "NOT AN ELEMENT OF" },
    { code: 0x2205, name: "EMPTY SET" },
    { code: 0x222A, name: "UNION" },
    { code: 0x2230, name: "VOLUME INTEGRAL" },
    { code: 0x2261, name: "IDENTICAL TO" },
    { code: 0x2270, name: "NEITHER LESS-THAN NOR EQUAL TO" }
];

test('C.b serialization', function (test) {
    console.warn(QUnit.config.current.testName);
    var storage_up = new Storage(false);
    var uplink = new Host('local~Cb1',0,storage_up);
    var storage_dl = new Storage(false);
    var downlink = new Host('local~Cb2',0,storage_dl);
    downlink.getSources = function () {return [uplink];};
    uplink.on(downlink);
    env.localhost = uplink;

    var vec = new CodePointVector();
    for(var i=0; i<unicode_math.length; i++) {
        vec.push(unicode_math[i]);
    }
    equal(vec.toString(),"∧∃∀∞∑∈∉∅∪∰≡≰");

    // console: ensure init-boot
    console.warn("dl-ing a collection");
    var vec_dl = downlink.get(vec.spec());
    equal(vec_dl.toString(),"∧∃∀∞∑∈∉∅∪∰≡≰");

    vec.push({
        code: 0x2276,
        name: "LESS-THAN OR GREATER-THAN"
    });
    equal(vec.toString(),"∧∃∀∞∑∈∉∅∪∰≡≰≶");
    equal(vec_dl.toString(),"∧∃∀∞∑∈∉∅∪∰≡≰≶");

    env.localhost = null;
});

asyncTest('C.c load&init events', function (test) {
    console.warn(QUnit.config.current.testName);
    var storage = new Storage(true);
    storage.states = {
        '/UnicodePoint#u262d+src1': JSON.stringify({
            _version:'time1+src1',
            code: 0x262d,
            name: 'Hammer and sickle'
        }),
        '/UnicodePoint#u262a+src2': JSON.stringify({
            _version:'time2+src2',
            code: 0x262a,
            name: 'Star and crescent'
        }),
        '/UnicodePoint#u2693+src3': JSON.stringify({
            _version:'time3+src3',
            code: 0x2693,
            name: 'Anchor'
        })
    };
    var host = new Host('local~Ca',0,storage);
    env.localhost = host;
    var vec = new CodePointVector();
    var symbols = '';
    expect(3);
    vec.onLoad4(function (ev) {
        equal(symbols,'');
        equal(ev,null);
    });
    vec.on4('entry:init', function (ev) {
        symbols += ev.entry.getChar();
    });
    vec.push('/UnicodePoint#u262d+src1');
    vec.push('/UnicodePoint#u262a+src2');
    vec.push('/UnicodePoint#u2693+src3');
    vec.onLoad4(function (ev) {
        deepEqual(symbols.match(/./g).sort(),'☭☪⚓'.match(/./g).sort());
        start();
    });
    env.localhost = null;
});

/*asyncTest('C.c event relay, API events', function (test) {
    console.warn(QUnit.config.current.testName);
    var storage_up = new Storage(true);
    var uplink = new Host('local~Cc0',0,storage_up);
    var downlink1 = new Host('local~Cc1',0);
    var downlink2 = new Host('local~Cc2',0);
    // create+fill object #1
    var math1 = new CodePointVector(unicode_math, downlink1);
    // open at #2
    var math2 = new CodePointVector(math1.spec(), downlink2);
    math2.on('.init', function(){
        // on: objects are OK
        equal(math2.toString(),"∧∃∀∞∑∈∉∅∪∰≡≰");
        start();
    });

});*/

/*
test('C.c set', function (test) {
    var storage = new Storage(false);
    var host = new Host('local~Ca',0,storage);
    env.localhost = host;
    var CodePointSet = Collection.Set.extend("CodePointSet",{
        entryType: UnicodePoint
    });
    var vec = new CodePointSet();
    vec.toString = function () {
        var ret = [];
        this.forEach(function(v){
            ret.push(v.code);
        });
        return ret.sort().join('');
    };
    vec.add(new UnicodePoint({name:"", code:0}));
    equal(vec.toString(),"easy");
    vec.unshift(new UnicodePoint({name:"", code:0}));
    var zu = new UnicodePoint({name:"", code:0});
    equal(vec.has(zu), false);
    vec.add(zu);
    equal(vec.has(zu), true);
    vec.add(zu); // copy
    equal(vec.has(zu), true);
    equal(vec.toString(),"easy");
    vec.remove(zu); // both
    equal(vec.has(zu), false);
    equal(vec.toString(),"easy");
    equal(vec.has(zu), true);
    env.localhost = null;
});

test('C.d map', function (test) {
    var storage = new Storage(false);
    var host = new Host('local~Ca',0,storage);
    env.localhost = host;
    var CodePointMap = Collection.Map.extend("CodePointMap",{
        entryType: UnicodePoint
    });
    var map = new CodePointMap();
    map.toString = function () {
        var ret = [];
        this.forEach(function(v){
            ret.push(v.code);
        });
        return ret.sort().join('');
    };

    var zu = new UnicodePoint({name:"", code:0});
    map.put(zu.getChar(), zu);
    map.put(zu.getChar()+'2', zu);
    equal(map.toString(),"zu ZU");
    map.remove(zu.getChar()); // one

    env.localhost = null;
});
*/
