"use strict";
var LoopbackStream = require('..');

asyncTest('1.a push/pop', function(test){
    var stream = new LoopbackStream();
    stream.on('data', function(data){
        equal(data,'push');
        start();
    });
    stream.push('push');
    equal(stream.pop(), '');
    stream.write('write');
    equal(stream.pop(), 'write');
    stream.write('1');
    stream.write('2');
    equal(stream.pop(), '12');
});

asyncTest('1.b pair', function(test){
    var streamA = new LoopbackStream();
    var streamB = new LoopbackStream(streamA);
    var strs = ['echo', 'direct', 'eof'];
    expect(4);
    streamA.on('data', function(data){
        equal(data.toString(),strs.shift());
    });
    streamA.on('end', function(data){
        ok(1);
        start();
    });
    streamB.on('data', function(data){
        this.write(data); // echo
    });
    streamB.on('end', function(data){
        this.end();
    });
    streamA.write('echo');
    streamB.push('direct');
    streamA.end('eof');
});

asyncTest('1.c pipe', function (test) {
    var stream1in = new LoopbackStream();
    var stream1out = new LoopbackStream(stream1in);
    var stream2in = new LoopbackStream();
    var stream2out = new LoopbackStream(stream2in);
    stream2out.on('data', function(data){
        equal(data,'data');
    });
    stream2out.on('end', function(data){
        start();
    });
    stream1out.pipe(stream2in);
    stream1in.end('data');
});
