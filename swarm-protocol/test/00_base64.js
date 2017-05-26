"use strict";
var tap = require('tape').test;
var Base64x64 = require("../src/Base64x64");

tap('protocol.00.A basic API', function (t) {

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
    var b = new Base64x64(a);
    var c = b.toDate();
    var d = new Base64x64(c);
    var e = d.toString();
    var f = d.toDate();
    t.equals(e, a);
    t.equals(c.toString(), f.toString());

    // Base64.now() current timestamp
    var now = Base64x64.now();
    t.equals(now.seq, 0);
    var ms1 = now.toDate().getTime();
    var ms2 = Date.now();
    t.ok( ms2>=ms1 && ms2-ms1<1000 );

    var inc = now.inc();
    t.equals(inc.seq, 1);

    let num = new Base64x64('0abc~~');
    t.equals(num.next(5).toString(), '0abd');
    t.equals(num.next(6).toString(), '0abd');
    t.equals(num.next(2).toString(), '0b');
    t.equals(new Base64x64('0').next(3).toString(), '001');
    t.ok( num.eq(num) );
    t.ok( num.eq('0abc~~0') );

    t.ok(num.round(3).eq('0ab'));

    t.notOk(Base64x64.is(':)'));

    const o1 = new Base64x64("abc01023fg");
    const o2 = new Base64x64("abc");
    t.equals( o1.relax(o2).toString(), "abc01" );
    t.equals( o2.relax(o1).toString(), "abc" );
    t.equals( o1.relax(o2,6).toString(), "abc01" );
    t.equals( o1.relax(o2,7).toString(), "abc0102" );

    t.end();
});

tap ('protocol.00.B base64 conversions perf', function(tap){
    var ms1 = new Date().getTime();
    var count = 100000;
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


tap ('protocol.00.C timestamping perf', function(tap){
    var ms1 = new Date().getTime();
    var count = 100000;
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

tap ('protocol.00.D non-aligned base64', function(tap) {
    const base = Base64x64.int2base(66, 3);
    tap.equal(base, '012');
    tap.equal(Base64x64.base2int('12'), 66);
    tap.throws(function(){
        Base64x64.int2base(-1);
    });
    tap.end();
});

tap ('protocol.00.E misc stuff', function(tap) {

    const base = new Base64x64('0000100002');
    tap.equal(base.highInt, 1);
    tap.equal(base.lowInt, 2);

    tap.equal(Base64x64.round('1234056789', 5), '1234');

    tap.end();
});

tap('protocol.00.F prefixes', function(tap){
    tap.equal(Base64x64.prefix_length('0', '123'), 0);
    tap.equal(Base64x64.prefix_length('0', '0123'), 1);
    tap.equal(Base64x64.prefix_length('1230', '123'), 10);
    tap.equal(Base64x64.prefix('0123010', '0123010abc'), '012301');
    tap.equal(Base64x64.prefix('0123010', '0123010'), '012301');
    tap.end();
});