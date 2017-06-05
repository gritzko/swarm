"use strict";
const tape = require('tape').test;
const Op = require("../src/Op");
const UID = require("../src/UUID");
const Frame = require("../src/Frame");

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
    frame.push(new Op('lww', '1D4ICC-XU5eRJ', '1D4ICC1-XU5eRJ', 'keyB', null, "valueB"));
    tap.equals(frame.toString(), '.lww#1D4ICC-XU5eRJ`{E!:keyA"valueA"@{1:keyB"valueB"');
    tap.end();
});


// tape ('ron.05.C compression modes', function (tap) {
// });