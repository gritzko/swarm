"use strict";
var swarm = require('..');
var VV = swarm.VV;
var tape = require('tap').test;

tape ('protocol.05.A VV basics', function (tap) {

    var vec = '!7AM0f+gritzko!0longago+krdkv!7AMTc+aleksisha!some+garbage';
    var vv = new VV(vec);
    tap.ok(vv.covers('7AM0f+gritzko'));
    tap.ok(!vv.covers('7AMTd+aleksisha'));
    tap.ok(!vv.covers('6AMTd+maxmaxmax'));
    tap.equal(vv.toString(),
        '!some+garbage!7AMTc+aleksisha!7AM0f+gritzko!0longago+krdkv');

    var map2 = new VV("!1QDpv03+anon000qO!1P7AE05+anon000Bu");
    tap.equal(map2.covers('1P7AE05+anon000Bu'), true, 'covers the border');

    var one = new VV('!1+one!2+two!0+three');
    var two = new VV('!0+two');
    var three = '!3+three';
    var add = one.addAll(two).addAll(three);
    tap.equal(add.toString(), '!3+three!2+two!1+one');

    tap.end();

});


tape ('protocol.05.C zero vector', function (tap) {
    var empty = new VV();
    tap.equal(empty.toString(), '!0', 'empty vector is !0');
    tap.ok(empty.covers('0'), '!0 covers 0');
    tap.ok(!empty.covers('1+a'), '!0 covers nothing');

    var empty2 = new VV('!0');
    tap.equal(empty2.toString(), '!0');

    var empty3 = new VV('!a+b!c+d');
    empty3 = empty3.remove('b').remove('c+d');
    tap.equal(empty3.toString(), '!0');
    tap.end();
});

