"use strict";
const tape = require('tape').test;
const Op = require("../src/Op");
const UID = require("../src/UUID");
const Frame = require("../src/Frame");
const Iterator = Frame.Iterator;

tape ('ron.05.A parse/iterate a frame', function (tap) {
    const frame = Frame.fromString(
        '.lww#1D4ICC-XU5eRJ@`{E! :keyA"valueA" @{1:keyB"valueB"'
    );
    const ops = [];
    for(let op of frame)
        ops.push(op);
    const locs = ops.map(op=>op.location.time);
    tap.deepEqual(locs, ["0", "keyA", "keyB"]);

    const short = Frame.Iterator.as("#time-author@`!");
    tap.ok(short.op.isState());
    tap.equals(short.op.object.toString(), "time-author");
    tap.ok(short.op.object.eq(short.op.event));

    tap.end();
});


tape ('ron.05.B append to a frame', function (tap) {
    const frame = new Frame("", Frame.ZIP_OPTIONS.ALLSET);
    frame.push('.lww#1D4ICC-XU5eRJ@`{E!');
    frame.push('.lww#1D4ICC-XU5eRJ@`{E:keyA"valueA"');
    frame.push(new Op('lww', '1D4ICC-XU5eRJ', '1D4ICC1-XU5eRJ', 'keyB', Op.js2ron("valueB")));
    tap.equals(frame.toString(), '.lww#1D4ICC-XU5eRJ`{E!:keyA"valueA"@{1:keyB"valueB"');
    tap.end();
});

tape ('ron.05.C frame splitting', function (tap) {

    const multiframe = Iterator.as(".lww#A@2:3!:4=5#B@b:6>7");

    tap.ok(!multiframe.end());

    const frame1 = multiframe.nextFrame();
    tap.equal(frame1.toString(), ".lww#A@2:3!:4=5");
    tap.ok(!multiframe.end());

    const frame2 = multiframe.nextFrame();
    tap.equal(frame2+'', ".lww#B@b:6>7");
    tap.ok(multiframe.end());

    tap.end();

});

// tape ('ron.05.C compression modes', function (tap) {
// });