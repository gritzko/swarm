"use strict";

var env = require('../lib/env');
var Model = require('../lib/Model');
var Storage = require('../lib/Storage');
var Host = require('../lib/Host');
var Collection = require('../lib/Collection');

var UnicodePoint = Model.extend('UnicodePoint',{
    defaults: {
        name: "",
        code: 0
    },
    getChar: function () {return String.fromCharCode(this.code);}
});


test('C.a vector', function (test) {
    var storage = new Storage(false);
    var host = new Host('local~Ca',0,storage);
    env.localhost = host;
    var CodePointVector = Collection.Vector.extend("CodePointVector",{
        entryType: UnicodePoint._pt._type
    });
    var vec = new CodePointVector();
    vec.toString = function () {
        var ret = [];
        this.vector.forEach(function(v){
            ret.push(String.fromCharCode(v.code));
        });
        return ret.join('');
    };
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
    var f_lenis = new UnicodePoint({ // ꬵ
        name: "LATIN SMALL LETTER LENIS F",
        code: 0xAB35
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
    env.localhost = null;
});
/*
test('C.b set', function (test) {
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

test('C.c map', function (test) {
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
