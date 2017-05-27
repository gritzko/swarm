"use strict";
const tap = require('tape').test;
const UUID = require('../src/UUID');
const UUIDVector = require('../src/UUIDVector');


// TODO invalid inputs

tap ('protocol.07.A builder', function(tap) {

    const b = new UUIDVector();
    b.push(UUID.ZERO);
    b.push(UUID.ZERO);
    b.push(UUID.ZERO);
    tap.equal(b.toString(), "0,,");
    for(let uid of b)
        tap.ok(uid.isZero());
    tap.equal(b.toArray().length, 3);

    tap.end();
});

tap ('protocol.07.B to/from an array 1', function(tap) {

    const id_array = [
        "ABCDEF-author",
        "ABCDGH-author",
        "ABCDIJ-author",
        "ABCDKLM-author",
        "ABCDKNO-author",
        "ABCDKN-author",
        "ABCDKNP-author",
        "ABCDKQR-author",
        "ABCDKQR-other",
        // FIXME   abc0 abde
        UUID.ZERO,
        UUID.ZERO,
        UUID.ZERO
    ].map(UUID.as);

    const vec = UUIDVector.fromArray(id_array);
    const arr = new UUIDVector(vec.toString()).toArray();
    tap.equals(arr.join(), id_array.join());

    tap.end();

});

// tap ('protocol.07.C splice', function(tap) {
//
// });

tap('protocol.08.D to/from an array 2', function (tap) {        //   :)

    const id_array = [
        'stamp-author',
        'stamp-author',
        'stamp1-author',
        'stamp12-author',
        'stamp3-author',
        'stamp34-author',
        'last2-one',
        'last2bb-one',
        'last2-one',
        'last-one',
        'last-one',
        'last-one'
    ].map(UUID.as);

    const vec = UUIDVector.fromArray(id_array);
    const arr = new UUIDVector(vec.toString()).toArray();
    tap.equals(arr.join(), id_array.join());

    tap.end();

});


tap ('protocol.07.E VV basics', function (tap) {

    // This test is so old! Nikita Kardakov is still on the list :)
    var old = '7AM0f-gritzko,0longago-krdkv,7AMTc-aleksisha,some-garbage';
    const vv = new UUIDVector(old);
    tap.ok(vv.covers('7AM0f-gritzko'));
    tap.ok(!vv.covers('7AMTd-aleksisha'));
    tap.ok(!vv.covers('6AMTd-maxmaxmax'));
    tap.equal(UUIDVector.fromMap(vv.toMap()).toString(),
        '7AMTc-aleksisha,some-garbage,7AM0f-gritzko,0longago-krdkv');
    tap.ok(vv.coversAll(vv));

    var map2 = new UUIDVector("1QDpv03-anon000qO,1P7AE05-anon000Bu");
    tap.equal(map2.covers('1P7AE05-anon000Bu'), true, 'covers the border');
/*
    var one = new UUIDVector('1-one,2-two,0-three');
    var two = new UUIDVector('0-two');
    var three = '@3-three';
    var add = one.addAll(two).addAll(three);
    tap.equal(add.toString(), '@3-three@2-two@1-one');

    tap.equals(one.max, '3');
    tap.equals(vv.max, 'some');

    const redundant = new VV('@1-me@2-me');
    tap.equal(redundant.toString(), '@2-me');
    tap.equal(redundant.get('me'), '2-me');
    tap.ok(redundant.has('me'));
    tap.notOk(redundant.has('notme'));
    tap.notOk(vv.coversAll(redundant));
*/
    tap.end();

});


tap ('protocol.07.F zero vector', function (tap) {
    var empty = new UUIDVector();
    tap.equal(empty.toString(), '', 'empty vector is ""');
    tap.ok(empty.covers('0'), '@0 covers 0');
    tap.ok(!empty.covers('1-a'), '@0 covers nothing');

    var empty2 = new UUIDVector('0');
    tap.equal(empty2.toString(), '0');

    tap.end();
});
