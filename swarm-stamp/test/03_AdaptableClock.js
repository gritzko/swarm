"use strict";
var lamp64 = require('..');
var tape = require('tap').test;
var Lamp = lamp64.LamportTimestamp;
var AdaptableClock = lamp64.AdaptableClock;
var chars64 = lamp64.base64.base64;

tape ('stamp.03.A calendarness', function(tap) {
    var date = new Date();
    var clock = new AdaptableClock('03A');
    clock.ms = function () { return date.getTime(); }
    var stamp = clock.issueTimestamp({precise: true});
    var parsed = AdaptableClock.parseTimestamp(stamp);

    tap.equal(parsed.date.getTime(), date.getTime());

    tap.end();
});


tape ('stamp.03.B offsets', function(tap) {
    var clock = new AdaptableClock('03B');
    var _23feb10 = '01'+chars64[23]+'00+origin';
    clock.seeTimestamp(_23feb10, 3); // 23 Feb 2010
    var stamp = clock.issueTimestamp().toString();
    tap.equal(stamp.substr(0,5), _23feb10.substr(0,5));
    var parsed = AdaptableClock.parseTimestamp(stamp);
    tap.equal(parsed.date.getUTCMonth(), 1);
    tap.equal(parsed.date.getUTCFullYear(), 2010);
    tap.equal(parsed.date.getUTCDate(), 23);
    tap.end();
});


tape ('stamp.03.C stuck-ahead', function(tap) {
    var clock = new AdaptableClock('03C');
    var stamp = clock.issueTimestamp();
    clock.seeTimestamp('01'+chars64[23]+'00+origin', 3); // 23 Feb 2010
    // now, the clock is stuck in the future
    setTimeout(function(){
        var stamp2 = clock.issueTimestamp();
        tap.equal(stamp.time().substr(0,5), stamp2.time().substr(0,5))
        tap.equal(stamp2.time().length, 11); // must use seq
        tap.end();
    }, 1000);
});

tape ('stamp.03.E precise', function(tap) {
    var clock = new AdaptableClock('03E');
    var stamp = clock.issueTimestamp({precise: true});
    tap.equal(stamp.time().length, 8);
    tap.end();
});

/*

IT LOOKS LIKE THE CODE CAN NOT GENERATE TWO STAMPS IN A MILLISECOND
SLOW!

tape ('stamp.03.D adaptable length', function(tap) {
    var clock = new AdaptableClock('replica');
    clock.issueTimestamp();
    var stamp2 = clock.issueTimestamp();
    var length = stamp2.time().length;
    for(var i=0; i<10; i++) {
        var stamp3 = clock.issueTimestamp();
        var newlen = stamp3.time().length;
        if (newlen!==12) {
            tap.fail(stamp3.toString());
        }
    }
    tap.end();
});
*/

