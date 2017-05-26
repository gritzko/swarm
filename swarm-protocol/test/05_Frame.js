"use strict";
const tape = require('tape').test;
const Op = require("../src/Op");
const UID = require("../src/UID");
const Frame = require("../src/Frame");

tape ('protocol.05.A parse/iterate a frame', function (tap) {
    const frame = Frame.fromString(
        '.lww#1D4ICC-XU5eRJ@\\{E\\! :keyA"valueA" @{1:keyB"valueB"'
    );
    const ops = [];
    for(let op of frame)
        ops.push(op);
    const locs = ops.map(op=>op.LocationUID().time);
    tap.deepEqual(locs, ["0", "keyA", "keyB"]);
    tap.end();
});


tape ('protocol.05.B append to a frame', function (tap) {
    const frame = new Frame("", Frame.ZIP_OPTIONS.ALLSET);
    frame.push(Op.fromString('.lww#1D4ICC-XU5eRJ@\\{E\\!'));
    frame.push(Op.fromString('.lww#1D4ICC-XU5eRJ@\\{E\\:keyA"valueA"'));
    frame.push(Op.fromString('.lww#1D4ICC-XU5eRJ@\\{1\\:keyB"valueB"'));
    tap.equals(frame.toString(), '.lww#1D4ICC-XU5eRJ\\{E\\!:keyA"valueA"@{1:keyB"valueB"');
    tap.end();
});