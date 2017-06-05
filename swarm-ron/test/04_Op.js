"use strict";
const tape = require('tape').test;
const Op = require("../src/Op");
const UID = require("../src/UUID");


tape ('protocol.04.A parse ops', function (tap) {

    const frame = '.lww#1D4ICC-XU5eRJ@`{E!';

    const first = Op.fromString(frame);

    tap.ok(first.isState());
    tap.ok(first.value(0)===Op.FRAME_VALUE);
    tap.equals(first.values().length, 1);
    tap.equals(first.int(0), "lww");
    tap.equals(first.int(1), "0");
    tap.equals(first.int(2), "1D4ICC");
    tap.ok(first.object.equals(UID.as("1D4ICC-XU5eRJ")));
    tap.equals(first.toString(), ".lww#1D4ICC-XU5eRJ@1D4ICCE-XU5eRJ!");

    const second = Op.fromString('.lww#1D4ICC-XU5eRJ@`{E:keyA"value\\u0041"');
    tap.ok(first.object.eq(second.object));
    tap.ok(first.event.eq(second.event));
    tap.deepEqual(second.values(), ["valueA"]);
    tap.equal(second.raw_value(0), '"value\\u0041"');
    tap.equal(second.int(6), "keyA");

    const third = Op.fromString('#1D4ICC1@`{2:keyB^3.141592e0');
    tap.deepEqual(third.int(4), "1D4ICC2");
    tap.deepEqual(third.values(), [3.141592]);
    tap.equal(third.raw_value(0), '^3.141592e0');
    tap.equal(third.int(6), "keyB");

    const direct = new Op(
        "lww", "1D4ICC-XU5eRJ", "1D4ICCE-XU5eRJ", "keyA",
        ['"value\\u0041"']
    );
    tap.equals(second.toString(), direct.toString());

    tap.end();

});
