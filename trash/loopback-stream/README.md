# Loopback local streams

aka PipedInputStream/PipedOutputStream
Mostly useful for testing stuff, as `node` is kind of single-thread.

    var streamA = new LoopbackStream();
    var streamB = new LoopbackStream(streamA);
    var strs = ['echo', 'direct', 'eof'];
    expect(4);
    streamA.on('data', function(data){
        data.toString() === strs.shift(); // true
    });
    streamA.on('end', function(data){
        // done
    });
    streamB.on('data', function(data){
        this.write(data); // echo
    });
    streamB.on('end', function(data){
        this.end(); // no more echo
    });
    streamA.write('echo');
    streamB.push('direct');
    streamA.end('eof');


see test/ for more usage examples.
