"use strict";
var tap = require('tap').test;
var swarm = require('..');
var Stamp = swarm.Stamp;
var Clock = swarm.Clock;


tap ('protocol.02.A Logical clocks API', function(tap) {

    // set clock to around epoch (1 Jan 2010)
    var clock = new Clock('leslie', {Clock: 'Logical', ClockLen: 6});

    var ts1 = clock.issueTimestamp();
    tap.equal(ts1.value.substr(0,6), '000001');
    tap.equal(ts1.origin, 'leslie');

    var ts2 = clock.issueTimestamp();
    tap.ok(ts2.value>ts1.value)
    tap.equal(ts2.value.substr(0,6), '000002');
    tap.equal(ts2.origin, 'leslie');

    // ensure a new timestamp is greater than any past stamps
    clock.seeTimestamp('00004+leslie');
    tap.ok(clock.issueTimestamp().toString()>'00004+leslie');

    // shorten a timestamp to 5 chars if possible
    var len5 = new Clock('chimera', {
        ClockLen: 5
    });
    var st5 = len5.issueTimestamp();
    tap.ok (st5.value.length<=5, 'length5');

    var fullLength = new Clock('long', {ClockLen: 8});
    var stamp = fullLength.issueTimestamp();
    tap.ok (stamp.value.length<=8); // accidental zero in 1/64 of cases

    tap.end();
});



tap ('protocol.02.B SecondPreciseClock sequence test', function (tap) {
    var clock = new Clock('gritzko');
    tap.plan(100);
    var ts1 = clock.issueTimestamp(), ts2, i=0;
    var iv = setInterval(function(){
        ts2 = clock.issueTimestamp();
        if (i++==100) {
            tap.end();
            clearInterval(iv);
        } else {
            tap.ok(ts2.gt(ts1), 'order is OK');
        }
        ts1 = ts2;
    }, 0);
});


tap ('stamp.01.C stuck-ahead', function(tap){
    var clock = new Clock('lagging', {
        ClockOffst: -100,
        ClockLen: 8
    });
    clock.seeTimestamp(new Stamp(new Date(), "correct"));
    // the lagging clock is now stuck-ahead
    var ts1 = clock.issueTimestamp();
    var ts2 = clock.issueTimestamp();
    var diff = Date.now() - ts1.ms;

    tap.ok( ts2.ms===ts1.ms );
    tap.ok( diff>=-25 && diff<25 );

    setTimeout(function () {

        var ts3 = clock.issueTimestamp();
        var now = new Date();
        var diff = now.getTime() - ts3.ms;
        tap.ok( diff>=75 && diff<125 );

        tap.end();
    }, 200);
});
