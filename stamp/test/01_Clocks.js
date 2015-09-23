"use strict";
var lamp64 = require('..');
var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}
var Lamp = lamp64.LamportTimestamp;


tape('0. Lamport timestamp', function(tap){
    var lamp1 = new Lamp('0');
    tap.equal(lamp1.isZero(), true, 'zero OK');
    tap.equal(lamp1.toString(), '0', 'zero str OK');
    var lamp2 = new Lamp('gritzko');
    tap.equal(lamp2.isZero(), true, 'sourced zero OK');
    tap.equal(lamp2.toString(), '0+gritzko', 'zero str OK');
    tap.ok(lamp2.gt(lamp1), 'fancy order');
    tap.ok(lamp2.eq('gritzko'), 'fancy equals');
    tap.ok(lamp2.eq('0+gritzko'), 'fancy equals');
    tap.ok(lamp2.eq(lamp2), 'fancy equals');
    var lamp3 = new Lamp('time+src');
    tap.ok(lamp3.eq('time+src'));
    tap.ok(lamp3.toString()==='time+src');
    tap.end();
});


tape ('a. SecondPreciseClock sequence test', function (tap) {
    var clock = new lamp64.SecondPreciseClock('gritzko');
    tap.plan(100);
    var ts1 = clock.issueTimestamp(), ts2, i=0;
    var iv = setInterval(function(){
        ts2 = clock.issueTimestamp();
        if (i++==100) {
            tap.end();
            clearInterval(iv);
        } else {
            tap.ok(ts2 > ts1);
        }
        ts1 = ts2;
    }, 0);
});

tape ('b. Version vector', function (tap){
    // the convention is: use "!version" for vectors and
    // simply "version" for scalars
    var vec = '!7AM0f+gritzko!0longago+krdkv!7AMTc+aleksisha!0ld!00ld#some+garbage';
    var map = new lamp64.VVector(vec, '!');
    tap.ok(map.covers('7AM0f+gritzko'), 'covers');
    tap.ok(map.covers('0ld'));
    tap.ok(!map.covers('7AMTd+aleksisha'), '!covers');
    tap.ok(!map.covers('6AMTd+maxmaxmax'));
    tap.ok(!map.covers('1+0ld'));
    tap.ok('garbage' in map.map);
    tap.equal(map.toString(),
        '!some+garbage!7AMTc+aleksisha!7AM0f+gritzko!0longago+krdkv');

    var map2 = new lamp64.VVector("!1QDpv03+anon000qO!1P7AE05+anon000Bu");
    tap.equal(map2.covers('1P7AE05+anon000Bu'), true, 'covers the border');

    // funny constructors TODO
    tap.ok(map.coversAll('source'));
    tap.ok(map.coversAll('0'));
    tap.ok(map.coversAll('!0!source'));

    tap.end();
});

tape('c. Minute-precise clox', function(tap){
    var clock = new lamp64.MinutePreciseClock('min');
    var prevts = '';
    for(var i=0; i<64; i++) {
        var ts = clock.issueTimestamp();
        tap.ok(/^[0-9a-zA-Z_~]{5}\+min$/.test(ts), 'timestamp is valid');
        tap.ok(ts>prevts, 'order is monotonous');
        prevts = ts;
    }
    for(i=0; i<130; i++) {
        ts = clock.issueTimestamp();
    }
    tap.ok(/^[0-9a-zA-Z_~]{7}\+min$/.test(ts), 'yeah, valid');
    tap.end();
    // tick 60 times
    // check the last char is changing
    // unless minute changed then restart
    // tick 60 times
    // see it spills over (extended ts)
});

tape('d. Timestamp-ahead', function(tap){
    var clock = new lamp64.SecondPreciseClock('normal');
    var ts = clock.issueTimestamp();
    var parsed = clock.parseTimestamp(ts);
    //var tenAhead = Spec.int2base(parsed.time+10, 5)+'+ahead';
    //var tenBehind = Spec.int2base(parsed.time-10, 5)+'+behind';
    var clockAhead = new lamp64.SecondPreciseClock('ahead', 10000);
    var clockBehind = new lamp64.SecondPreciseClock('behind', -10000);
    var tsAhead = clockAhead.issueTimestamp();
    var tsBehind = clockBehind.issueTimestamp();
    tap.ok(tsAhead>ts);
    tap.ok(ts>tsBehind);
    tap.end();
});

tape('e. Timestamp to date', function(tap){
    var clock = new lamp64.SecondPreciseClock('normal');
    var ts = clock.issueTimestamp();
    var date = new Date();
    var recovered = clock.timestamp2date(ts);
    tap.ok( Math.abs(date.getTime()-recovered.getTime()) < 2000 );
    tap.end();
});

tape('f. Lamport clocks', function(tap){
    var clock = new lamp64.LamportClock('leslie');
    var ts1 = clock.issueTimestamp();
    tap.equal(ts1,'00000+leslie');
    var ts2 = clock.issueTimestamp();
    tap.equal(ts2,'00001+leslie');
    clock.checkTimestamp('00004+leslie');
    tap.equal(clock.issueTimestamp(),'00005+leslie');

    var prefixed = new lamp64.LamportClock('chimera', {
        start: 4,
        prefix: '0PRE_',
        length: 3
    });
    var ch1 = prefixed.issueTimestamp();
    tap.equal(ch1,'0PRE_004+chimera', 'heavily customized clocks');

    var preset = new lamp64.LamportClock('src', { start: 'now00' });
    tap.equal(preset.issueTimestamp(), 'now00+src', 'string preset OK');
    tap.equal(preset.issueTimestamp(), 'now01+src', 'incs well');
    tap.equal(preset.issueTimestamp(), 'now02+src');

    tap.end();
});
