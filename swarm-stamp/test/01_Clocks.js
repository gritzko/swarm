"use strict";
var lamp64 = require('..');
var tape = require('tap').test;
var Lamp = lamp64.LamportTimestamp;


tape ('stamp.01._ Lamport timestamp', function(tap){
    var lamp1 = new Lamp('0');
    tap.equal(lamp1.isZero(), true, 'zero OK');
    tap.equal(lamp1.toString(), '0', 'zero str OK');
    var lamp2 = new Lamp('gritzko');
    tap.equal(lamp2.isZero(), true, 'sourced zero OK');
    tap.equal(lamp2.toString(), '0+gritzko', 'zero time OK');
    tap.ok(lamp2.gt(lamp1), 'fancy order');
    tap.ok(lamp2.eq('gritzko'), 'fancy equals');
    tap.ok(lamp2.eq('0+gritzko'), 'fancy equals');
    tap.ok(lamp2.eq(lamp2), 'fancy equals');
    var lamp3 = new Lamp('time+src');
    tap.ok(lamp3.eq('time+src'));
    tap.ok(lamp3.toString()==='time+src');
    tap.notOk(lamp3.eq('later+src'));
    tap.notOk(lamp3.gt('zzz+src'));
    tap.ok(lamp3.gt('time+Src'), 'order by src');
    tap.ok(lamp3.gt('tim+src'), 'order by timestamp');
    tap.end();
});


tape ('stamp.01.a SecondPreciseClock sequence test', function (tap) {
    var clock = new lamp64.SecondPreciseClock('gritzko');
    tap.plan(100);
    var ts1 = clock.issueTimestamp(), ts2, i=0;
    var iv = setInterval(function(){
        ts2 = clock.issueTimestamp();
        if (i++==100) {
            tap.end();
            clearInterval(iv);
        } else {
            tap.ok(ts2 > ts1, 'order is OK');
        }
        ts1 = ts2;
    }, 0);
});


tape ('stamp.01.b Version vector', function (tap){
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

tape ('stamp.01.c. Minute-precise clox', function(tap){
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


tape ('stamp.01.d. Timestamp-ahead', function(tap){
    var clock = new lamp64.SecondPreciseClock('normal');
    var ts = clock.issueTimestamp();
    var parsed = clock.parseTimestamp(ts);
    //var tenAhead = Spec.int2base(parsed.time+10, 5)+'+ahead';
    //var tenBehind = Spec.int2base(parsed.time-10, 5)+'+behind';
    var clockAhead = new lamp64.SecondPreciseClock('ahead', {
        ClockOffset: 10000
    });
    var clockBehind = new lamp64.SecondPreciseClock('behind', {
        ClockOffset: -10000
    });
    var tsAhead = clockAhead.issueTimestamp();
    var tsBehind = clockBehind.issueTimestamp();
    tap.ok(tsAhead>ts);
    tap.ok(ts>tsBehind);
    tap.end();
});


tape ('stamp.01.e. Timestamp to date', function(tap){
    var clock = new lamp64.SecondPreciseClock('normal');
    var ts = clock.issueTimestamp();
    var date = new Date();
    var recovered = clock.timestamp2date(ts);
    tap.ok( Math.abs(date.getTime()-recovered.getTime()) < 2000 );
    tap.end();
});

tape ('stamp.01.f. Lamport clocks', function(tap){
    var clock = new lamp64.LamportClock('leslie');
    var ts1 = clock.issueTimestamp();
    tap.equal(ts1.time(), '00001');
    tap.equal(ts1.origin(), 'leslie');
    var ts2 = clock.issueTimestamp();
    tap.equal(ts2.time(), '00002');
    tap.equal(ts2.origin(), 'leslie');
    clock.seeTimestamp('00004+leslie');
    tap.equal(clock.issueTimestamp().toString(),'00005+leslie');

    var prefixed = new lamp64.LamportClock('003+chimera', {
        ClockLength: 3
    });
    var ch1 = prefixed.issueTimestamp().toString();
    tap.equal(ch1,'004+chimera', 'heavily customized clocks');

    var preset = new lamp64.LamportClock('now00+src');
    tap.equal(preset.issueTimestamp().toString(), 'now01+src', 'string preset OK');
    tap.equal(preset.issueTimestamp().toString(), 'now02+src', 'incs well');
    tap.equal(preset.issueTimestamp().toString(), 'now03+src');

    tap.end();
});


tape ('stamp.01.g replica tree', function (tap) {
    var l1 = new Lamp('timeismoney+one~two~tree~four');
    var p1 = l1.replicaTreePath();
    tap.deepEqual(p1, ['swarm', 'one', 'two', 'tree', 'four']);
    var p2 = new Lamp('~cluster~replica').replicaTreePath();
    tap.deepEqual(p2, ['swarm', 'cluster', 'replica']);
    var p3 = new Lamp('swarm').replicaTreePath();
    tap.deepEqual(p3, ['swarm']);
    tap.ok(new Lamp('~clu~joe').isInSubtree('swarm'));
    tap.ok(new Lamp('~clu~joe').isInSubtree('~clu'));
    tap.ok(new Lamp('joe~replica').isInSubtree('joe'));
    tap.ok(new Lamp('~1~joe~replica').isInSubtree('~1~joe'));
    tap.ok(new Lamp('~1~joe~replica').isInSubtree('~1'));
    tap.notOk(new Lamp('~1~joe~replica').isInSubtree('~2~joe'));
    tap.notOk(new Lamp('~1~joe').isInSubtree('~1~joe~replica'));
    tap.ok(new Lamp('~1~joe~replica').isInSubtree('~1~joe~replica'));
    tap.end();
});
