"use strict";
var protocol = require('..');
var Stamp = protocol.Stamp;
var Base64x64 = protocol.Base64x64;
var tap = require('tape').test;


tap ('protocol.01.A Lamport timestamp', function(tap){

    var stamp1 = new Stamp('0');
    tap.equal(stamp1.isZero(), true, 'zero OK');
    tap.equal(stamp1.toString(), '0', 'zero str OK');

    var stamp2 = new Stamp('0+gritzko');
    tap.equal(stamp2.isZero(), true, 'sourced zero OK');
    tap.equal(stamp2.toString(), '0+gritzko', 'zero time OK');
    tap.ok(stamp2.gt(stamp1), 'fancy order');
    tap.ok(stamp2.eq('0+gritzko'), 'fancy equals');
    tap.ok(stamp2.eq(stamp2), 'fancy equals');

    var stamp3 = new Stamp('time', 'origin');
    tap.ok(stamp3.eq('time+origin'));
    tap.ok(stamp3.toString()==='time+origin');
    tap.notOk(stamp3.eq('later+origin'));
    tap.notOk(stamp3.gt('zzz+origin'));
    tap.ok(stamp3.gt('time+Origin'), 'order by origin');
    tap.ok(stamp3.gt('tim+origin'), 'order by timestamp');

    var err = new Stamp('~~~~~~~~~~');
    tap.ok(err.isAbnormal());
    tap.ok(err.isError());

    var now = new Date();
    var stamp_now = new Stamp(now, "me");
    tap.equals(stamp_now.origin, "me");
    tap.equals(stamp_now.date.getTime(), now.getTime());

    tap.ok(new Stamp('~').isNever());
    tap.ok(new Stamp('~').isTranscendent());
    tap.ok(new Stamp('0').isZero());
    tap.ok(new Stamp('0').isTranscendent());
    tap.equals(new Stamp("n0nN0","rmalizd00").toString(), "n0nN+rmalizd");

    tap.end();

});


tap ('protocol.01.B replica tree', function (t) {

    // assuming 1243 formula for replica ids
    // https://gritzko.gitbooks.io/swarm-the-protocol/content/replica.html

    var primus_stamp = new Stamp("time", "P");
    var peer_stamp = new Stamp("time", "Ppr");
    var client_stamp = new Stamp("time", "Pprclnt");
    var session_stamp = new Stamp("time", "PprclntSsN");

    t.ok( primus_stamp.isUpstreamOf(peer_stamp) );
    t.ok( client_stamp.isDownstreamOf(peer_stamp) );
    t.ok( primus_stamp.isUpstreamOf(client_stamp) );
    t.ok( session_stamp.isDownstreamOf(peer_stamp) );

    t.notOk( primus_stamp.isUpstreamOf(primus_stamp) );
    t.notOk( peer_stamp.isUpstreamOf(primus_stamp) );

    t.ok(peer_stamp.isSameOrigin("laterTime+Ppr"));

    t.end();
});
