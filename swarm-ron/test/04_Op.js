"use strict";
const tape = require('tape').test;
const Op = require("../src/Op");
const UUID = require("../src/UUID");


tape ('ron.04.A parse ops', function (tap) {

    const frame = '.lww#1D4ICC-XU5eRJ@`{E!';

    const first = Op.fromString(frame);

    tap.ok(first.isState());
    tap.ok(first.value(0)===Op.FRAME_VALUE);
    tap.equals(first.values().length, 1);
    tap.equals(first.int(0), "lww");
    tap.equals(first.int(1), "0");
    tap.equals(first.int(2), "1D4ICC");
    tap.ok(first.object.equals(UUID.as("1D4ICC-XU5eRJ")));
    tap.equals(first.toString(), ".lww#1D4ICC-XU5eRJ`{E!");

    const second = Op.fromString('.lww#1D4ICC-XU5eRJ`{E:keyA"value\\u0041"');
    tap.ok(first.object.eq(second.object));
    tap.ok(first.event.eq(second.event));
    tap.deepEqual(second.values(), ["valueA"]);
    tap.equal(second.raw_values(), '"value\\u0041"');
    tap.equal(second.int(6), "keyA");

    const third = Op.fromString('#1D4ICC1@`{2:keyB^3.141592e0');
    tap.deepEqual(third.int(4), "1D4ICC2");
    tap.deepEqual(third.values(), [3.141592]);
    tap.equal(third.raw_values(), '^3.141592e0');
    tap.equal(third.int(6), "keyB");

    const direct = new Op(
        "lww", "1D4ICC-XU5eRJ", "1D4ICCE-XU5eRJ", "keyA",
        '"value\\u0041"'
    );
    tap.equals(second.toString(), direct.toString());

    tap.end();

});


tape ('ron.04.B parse values', function (tap) {

    const op = Op.as(".lww#1D4ICC-XU5eRJ@1D4ICCE-XU5eRJ=1^1.2>3");

    tap.equal(op.values().length, 3);
    tap.equal(op.value(0), 1);
    tap.equal(op.value(1), 1.2);
    tap.equal(op.value(2)+'', '3');

    const clone = new Op(
        op.type, op.object, op.event, op.location,
        Op.atoms(1, 1.2, UUID.as('3'))
    );
    const zip = clone.toString();
    tap.equal(zip, ".lww#1D4ICC-XU5eRJ`{E=1^1.2>3");
    const unparsed = new Op(
        op.type, op.object, op.event, op.location,
        "=1^1.2000>3" // values are forwarded verbatim
    );
    tap.equal(unparsed.toString(), zip.replace("1.2", "1.2000"));

    tap.end();

});


tape ('ron.04.A compress ops', function (tap) {

    const op = new Op("lww", "a-1", "cdefgh-3", "g-8", "=5");
    const lop1 = new Op("lww", "b-1", "cdef-3", "g-1", "=10");
    const lop2 = new Op("lww", "b-1", "cdef-3", "g-9", "=10");

    const op1 = op.toZipString(lop1);
    tap.equal(op1, '#a@(gh:-8=5');

    const op2 = op.toZipString(lop2);
    // BUG: '#a(gh:-8=5'
    tap.equal(op2, '#a@(gh:-8=5');

    const dec_op1 = Op.fromZipString(op1, lop1).toString()
    tap.equal(dec_op1, '.lww#a-1@cdefgh-3:g-8=5');

    const dec_op2 = Op.fromZipString(op2, lop2).toString()
    // BUG: '.lww#a-1000gh@cdef-3:g-8=5'
    tap.equal(dec_op1, dec_op2);  // Invariant.

    tap.end();

});
