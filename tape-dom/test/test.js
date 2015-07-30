"use strict";

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('..');
    tape_dom(tape);
}

tape('trivial matches', function (tap) {
    tap.plan(5);
    tap.equal(5,5);
    tap.equal("string","string");
    tap.deepEqual({x:1, y:{z:3}}, {x:1, y:{z:3}});
    tap.ok(true);
    tap.throws(function evil(){
        throw new Error("i vil kil you");
    }, /kil/, "it throws");
    tap.comment("all those are OK");
});

tape('simple mismatches', function (tap) {
    tap.plan(4);
    tap.equal(5,6);
    tap.equal("string","");
    tap.deepEqual({x:1, y:{z:3}}, {x:1, y:{z:2}});
    tap.ok(false);
    tap.throws(function evil(){
        throw new Error("i vil mis you");
    }, /kil/, "it throws");
    tap.comment("all those are not OK");
});
