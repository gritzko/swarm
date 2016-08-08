"use strict";
var tap = require('tap').test;
var Base64x64 = require("../src/Base64x64");

tap('protocol.01.A basic API', function (t) {

    // date constructor
    var epoch = new Date("January 1, 2010 00:00:00 UTC");
    var base = new Base64x64(epoch);
    t.equals(base.toString(), "0");

    // equals()
    t.ok( base.equals('0') );
    t.ok( base.equals('000') );
    t.ok( base.equals(epoch) );
    t.ok( base.equals([0,0]) );

    // array constructor (js has no 64 bit ints)
    var arr = new Base64x64([0,1]);
    t.equals( arr.toString(), '0000000001' );
    // last 12 bits store the sequence number
    t.equals(arr.toDate().getTime(), epoch.getTime());
    t.equals(arr.seq, 1);

    // string constructor
    var stamp = new Base64x64("1CQKn");
    var spb_trip_date = new Date("Fri May 27 20:50:00 UTC 2016");
    var decoded = stamp.toDate();
    t.equals(decoded.getTime(), spb_trip_date.getTime());

    // normalization
    t.equals( new Base64x64("1230").toString(), "123" );

    // conversion cycle: string->base->date->base->string,date
    var a = "1F7Ca8";
    var b = new Base64x64("1F7Ca8");
    var c = b.toDate();
    var d = new Base64x64(c);
    var e = d.toString();
    var f = d.toDate();
    t.equals(e, a);
    t.equals(c.toString(), f.toString());

    // Base64.now() current timestamp
    var now = Base64x64.now(3);
    t.equals(now.seq, 3);
    var ms1 = now.toDate().getTime();
    var ms2 = Date.now();
    t.ok( ms2>=ms1 && ms2-ms1<1000 );

    t.end();
});

tap ('protocol.01.B base64 conversions perf', function(tap){
    var ms1 = new Date().getTime();
    var count = 1000000;
    for(var i=0; i<count; i++) {
        if (Base64x64.base2int(Base64x64.int2base(i)) !== i) {
            tap.fail('mismatch at '+i);
        }
    }
    var ms2 = new Date().getTime();
    console.warn('\nDid '+count+' int-base64-int conversions in '+(ms2-ms1)+'ms');
    tap.end();
    // 152ms for me
});


tap ('protocol.01.C timestamping perf', function(tap){
    var ms1 = new Date().getTime();
    var count = 1000000;
    var year = Base64x64.now().toString().substr(0,2);
    for(var i=0; i<count; i++) {
        var stamp = Base64x64.now(i&4095);
        if (year !== stamp.toString().substr(0,2)) {
            tap.fail('mismatch at '+i);
        }
    }
    var ms2 = new Date().getTime();
    console.warn('\nMade '+count+' timestamps in '+(ms2-ms1)+'ms');
    tap.end();
    // 700ms for me
});
