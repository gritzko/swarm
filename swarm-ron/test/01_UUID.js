"use strict";
const Base = require("../src/Base64x64");
const UID = require("../src/UUID");
const tap = require('tape').test;


tap ('ron.01.A Lamport timestamp', function(tap){

    var stamp1 = new UID('0');
    tap.equal(stamp1.isZero(), true, 'zero OK');
    tap.equal(stamp1.toString(), '0', 'zero str OK');

    var stamp2 = UID.fromString('0-gritzko');
    tap.equal(stamp2.isZero(), true, 'sourced zero OK');
    tap.equal(stamp2.toString(), '0-gritzko', 'zero time OK');
    tap.ok(stamp2.gt(stamp1), 'fancy order');
    tap.ok(stamp2.eq('0-gritzko'), 'fancy equals');
    tap.ok(stamp2.eq(stamp2), 'fancy equals');

    var stamp3 = new UID('time', 'origin');
    tap.ok(stamp3.eq('time-origin'));
    tap.ok(stamp3.toString()==='time-origin');
    tap.notOk(stamp3.eq('later-origin'));
    tap.notOk(stamp3.gt('zzz-origin'));
    tap.ok(stamp3.gt('time-Origin'), 'order by origin');
    tap.ok(stamp3.gt('tim-origin'), 'order by timestamp');

    var err = new UID('~~~~~~~~~~');
    tap.ok(err.isAbnormal());
    tap.ok(err.isError());

    var now = new Date();
    var stamp_now = new UID(now, "me");
    tap.equals(stamp_now.origin, "me");
    tap.equals(stamp_now.date.getTime(), now.getTime());

    tap.ok(new UID('~').isNever());
    tap.ok(new UID('~').isTranscendent());
    tap.ok(new UID('0').isZero());
    tap.ok(new UID('0').isTranscendent());
    tap.equals(new UID("n0nN0","rmalizd00").toString(), "n0nN-rmalizd");

    tap.ok(UID.as("#1").eq(UID.ERROR));

    const one = UID.as('0000000010-one');
    const two = one.next('two');
    tap.ok(two.eq('0000000011-two'));

    tap.end();

});


tap ('ron.01.B replica tree', function (t) {

    // assuming 1243 formula for replica UIDs
    // https://gritzko.gitbooks.io/swarm-the-protocol/content/replica.html

    var primus_stamp = new UID("time", "P");
    var peer_stamp = new UID("time", "Ppr");
    var client_stamp = new UID("time", "Pprclnt");
    var session_stamp = new UID("time", "PprclntSsN");

    t.ok( primus_stamp.isUpstreamOf(peer_stamp) );
    t.ok( client_stamp.isDownstreamOf(peer_stamp) );
    t.ok( primus_stamp.isUpstreamOf(client_stamp) );
    t.ok( session_stamp.isDownstreamOf(peer_stamp) );

    t.notOk( primus_stamp.isUpstreamOf(primus_stamp) );
    t.notOk( peer_stamp.isUpstreamOf(primus_stamp) );

    t.ok(peer_stamp.isSameOrigin("laterTime-Ppr"));

    // assuming 0172 is the default
    const rUID = UID.as('123-RgritzkoSE').Origin;
    t.equal(rUID.primus, '0');
    t.equal(rUID.peer, 'R');
    t.equal(rUID.client, '0gritzko');
    t.equal(rUID.session, '00000000SE');

    t.end();
});

tap ('ron.01.C order', function (tap) {

    tap.ok(UID.as('12345-src').eq('123450-src'));
    tap.ok(UID.as('12345-src').ge('123450-src'));
    tap.notOk(UID.as('12345-src').gt('123450-src'));
    tap.notOk(UID.as('12345-src').lt('123450-src'));
    tap.ok(UID.as('12345-src').le('123450-src'));

    tap.notOk(UID.as('12345-src').eq('12345-srd'));
    tap.notOk(UID.as('12345-src').ge('12345-srd'));
    tap.ok(UID.as('12345-src').le('12345-srd'));
    tap.ok(UID.as('12345-src').lt('12345-srd'));
    tap.notOk(UID.as('12345-src').gt('12345-srd'));
    tap.ok(UID.as('12345-srd').gt('12345-src'));

    tap.end();

});


tap ('ron.01.D conversions and checks', function (tap) {

    tap.ok( UID.is('12345ABCDE-originofop') );
    tap.ok( UID.is('12345ABCDE') );
    tap.ok( !UID.is('12345ABCDEF-originofop') );
    tap.ok( !UID.is('12345ABCDE-') );
    tap.ok( UID.is('12345ABCDE-0') );
    tap.ok( UID.is('12345ABCDE-0000000000') );
    tap.ok( UID.is('0') );
    tap.ok( !UID.is('') );

    const uuid = new UID(Base.fromString("1P17Ba3R"), "replica");
    const rfc = uuid.toRFC4122();
    tap.equal(rfc, 'b7af8530-4762-11e7-8000-d30b67940000');

    tap.end();

});

tap ('ron.01.E zip', function (tap) {

    const one = UID.fromString("0000000001-origin");
    const two = UID.fromString("0000000002-origin");
    const three = UID.fromString("0000000003-orig");
    const four = UID.fromString("0000000001-original");
    tap.equal(one.toZipString(two), ")1");
    tap.equal(one.toZipString(one), "");
    tap.equal(three.toZipString(two), ")3(");
    tap.equal(four.toZipString(one), "-{al"); // REGRESSION: "{al"

    tap.end();

});
