"use strict";
var stamp = require('..');
var VV = stamp.VV;
var AnchoredVV = stamp.AnchoredVV;

var tape = require('tap').test;

tape ('stamp.02.A VV basics', function (tap) {

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

tape ('stamp.02.B basic anchored syntax', function (tap) {
    var an1 = new AnchoredVV(
        'time0+sourceA!time2+sourceB!time3+sourceC!time4+sourceC' );
    tap.equal(an1.anchor, 'time0+sourceA');
    tap.equal(an1.vv.get('sourceB'), 'time2+sourceB');
    tap.equal(an1.vv.get('something+sourceC'), 'time4+sourceC');
    tap.equal(an1.vv.has('sourceC'), true);
    tap.equal(an1.vv.has('sourceB'), true);
    tap.equal(an1.vv.has('sourceA'), false);
    tap.equal(an1.toString(), 'time0+sourceA!time4+sourceC!time2+sourceB');

    tap.end();
});


tape ('stamp.01.b Version vector', function (tap){
    // the convention is: use "!version" for vectors and
    // simply "version" for scalars
    var vec = '!7AM0f+gritzko!0longago+krdkv!7AMTc+aleksisha!0ld!00ld#some+garbage';
    var map = new lamp64.VVector(vec, '!');
    tap.ok(map.covers('7AM0f+gritzko'), 'covers');
    tap.ok(map.covers('0ld'));
    tap.ok(!map.covers('7AMTd+aleksisha'), '!covers');
    tap.ok(!map.covers('6AMTd+maxmaxmax'));
    tap.ok(!map.covers('1+0ld'));
    tap.ok('garbage' in map.map);
    tap.equal(map.toString(),
        '!some+garbage!7AMTc+aleksisha!7AM0f+gritzko!0longago+krdkv');

    var map2 = new lamp64.VVector("!1QDpv03+anon000qO!1P7AE05+anon000Bu");
    tap.equal(map2.covers('1P7AE05+anon000Bu'), true, 'covers the border');

    // funny constructors TODO
    tap.ok(map.coversAll('source'));
    tap.ok(map.coversAll('0'));
    tap.ok(map.coversAll('!0!source'));

    tap.end();
});

tape ('stamp.02.C zero vector', function (tap) {
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

tape ('stamp.02.D mutations', function (tap) {
    var an = new AnchoredVV();
    tap.equal(an.toString(), '0');

    an.setAnchor('time1+srcA');
    an.addTip('time0+srcA');
    tap.equal(an.toString(), 'time1+srcA!time0+srcA', 'anchor eats'); // TODO anchor eats!!!!

    an.addTip('time4+srcB');
    an.addTip('time3+srcB');
    tap.equal(an.toString(), 'time1+srcA!time4+srcB!time0+srcA', 'vv grows');
    tap.equal(an.getTip('srcB'), 'time4+srcB', 'get tip entries');
    tap.equal(an.getTip('srcC'), '0');
    tap.equal(an.vv.covers('time4+srcB'), true, 'covers()');
    tap.equal(an.vv.covers('time+srcA'), true);
    tap.equal(an.vv.covers('time2+srcA'), false);
    tap.equal(an.vv.covers('time5+srcB'), false);

    an.addTip('time1+srcA');
    tap.equal(an.toString(), 'time1+srcA!time4+srcB!time1+srcA', 'eats again'); // FIXME eats

    an.setAnchor('time5+srcC');
    tap.equal(an.toString(), 'time5+srcC!time4+srcB!time1+srcA');

    an.removeTip('srcB');
    tap.equal(an.toString(), 'time5+srcC!time1+srcA');

    tap.end();
});
