"use strict";
var stamp = require('..');
var VV = stamp.VV;
var AnchoredVV = stamp.AnchoredVV;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}

tape ('2.A VV basics', function (tap) {

    var vec = '!7AM0f+gritzko!0longago+krdkv!7AMTc+aleksisha!some+garbage';
    var vv = new VV(vec);
    tap.ok(vv.covers('7AM0f+gritzko'));
    tap.ok(!vv.covers('7AMTd+aleksisha'));
    tap.ok(!vv.covers('6AMTd+maxmaxmax'));
    tap.equal(vv.toString(),
        '!some+garbage!7AMTc+aleksisha!7AM0f+gritzko!0longago+krdkv');

    var map2 = new VV("!1QDpv03+anon000qO!1P7AE05+anon000Bu");
    tap.equal(map2.covers('1P7AE05+anon000Bu'), true, 'covers the border');

    //var vv = new VV('!time0+author~session1!time1+author~session2');

    tap.end();

});

tape ('2.B basic anchored syntax', function (tap) {
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

tape ('2.C zero vector', function (tap) {
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

tape ('2.D mutations', function (tap) {
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
