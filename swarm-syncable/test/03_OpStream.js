"use strict";
var sync = require('..');
var Op = sync.Op;
var StreamOpSource = sync.StreamOpSource;
var OpSource = sync.OpSource;
var bat = require('swarm-bat');
var BatStream = bat.BatStream;

var tape = require('tap').test;

tape ('syncable.03.A simple cases', function (t) {
    var stream = new BatStream();

    // OpSource.debug = true;
    // StreamOpSource.debug = true;

    var pair = new StreamOpSource(stream.pair, {syncFlush: true});
    var opstream = new StreamOpSource(stream, {syncFlush: true});

    var send_ops = Op.parse(
        '/Model#stamp+author!time3+user3~ssn.on\tpos\n'+
               '\t!stamp+source.op\tvalue\n'+
               '\t!stamp2+source2.op\tvalue2\n\n',
        'time1+user1~ssn'
    ).ops;
    var send = send_ops[0];
    t.equal(send_ops.length, 1, 'parse is OK');

    opstream.on('handshake', function(hs) {
        t.equal(hs.spec+'', '/Swarm+Host#db+cluster!time1+user1~ssn.on', 'hs spec');
        t.equal(hs.value, '');
    });

    opstream.on('op', function(op) {
        t.equal(op.spec+'', send.spec+'', 'spec matches');
        t.equal(op.value, send.value, 'value matches');
        t.equal(op.source, 'time1+user1~ssn', 'source is correct');
        t.deepEqual(op.patch, send.patch, 'patch matches');
    });

    opstream.on('end', function() {
        t.end();
    });

    opstream.on('error', function(err) {
        console.warn('some error', err.value);
        t.fail('some error');
    });

    pair.writeHandshake(new Op('/Swarm+Host#db+cluster!time1+user1~ssn.on', ''));
    pair.write(send);
    pair.flush(); // keepalive must cause no reaction
    pair.writeEnd();
});

tape ('syncable.03.B defragmentation', function (t) {
    var stream = new BatStream();
    var opstream = new StreamOpSource(stream.pair, {source: 'pair'});
    var op = new Op('/Swarm#db+cluster!stream.on', '', 'pair');
    var str = op.toString()+'\n';

    opstream.on('handshake', function(recv_op){
        t.equal(''+recv_op.spec, ''+op.spec, 'spec matches');
        t.equal(recv_op.value, op.value, 'value matches');
        t.end();
    });

    for (var i = 0; i < str.length; i++) {
        stream.write(str.charAt(i));
    }
});

tape ('syncable.03.C error', function (t) {
    var stream = new BatStream();
    var opstream = new StreamOpSource(stream.pair, {});
    t.plan(1);
    opstream.on('op', function(recv_op){
        t.fail('no ops here');
    });
    opstream.on('error', function(msg) {
        t.pass(msg);
    });
    opstream.on('end', function() {
        t.end();
    });
    stream.write("!не операция\n");
});

tape ('syncable.03.D handshake', function (t) {
    var stream = new BatStream();
    var opstream = new StreamOpSource(stream.pair);
    t.plan(4);
    opstream.once('handshake', function(hs_op) {
        t.equal(hs_op.origin(), 'swarm~cluster');
        t.equal(hs_op.id(), 'db+shard');
        opstream.on('op', more_data);
    });
    function more_data(recv_op){
        t.equal(recv_op.source, 'stamp+swarm~cluster');
        t.equal(''+recv_op.spec, '/Model#stamp!time.on');
    }
    opstream.on('error', function(msg) {
        t.fail('no error here');
    });
    stream.write("/Swarm#db+shard!stamp+swarm~cluster.on\t\n");
    stream.write("/Model#stamp!time.on\t\n\n");
});

tape ('syncable.03.E destroy()', function (t) {
    var stream = new BatStream();
    var opstream = new StreamOpSource(stream.pair);
    t.plan(1);
    opstream.once('op', function(recv_op){
        t.equal(recv_op.stamp(), 'time', '1st op OK');
        opstream.destroy();
        opstream.on('data', function(){
            t.fail('destroyed');
        });
    });
    opstream.on('error', function(msg) {
        t.fail('no errors');
    });
    stream.write("/Swarm#db+shard!stamp+swarm~cluster.on\t\n");
    stream.write("/Model#stamp!time.on\t\n");
    stream.write("/Model#stamp!more.on\t\n");
});


tape ('syncable.03.F stream end', function (t) {
    var stream = new BatStream();
    var opstream = new StreamOpSource(stream.pair);
    t.plan(3);

    opstream.once('handshake', function(hs_op) {
        t.equal(hs_op.origin(), 'swarm~ssn');
        t.equal(hs_op.id(), 'db+cluster');
    });
    opstream.on('end', function () {
        t.ok(true, 'Got end event');
    });
    stream.write("/Swarm#db+cluster!stamp+swarm~ssn.on\t\n");
    stream.write("/Model#stamp!time.on\t\n");
    stream.end();
});

tape ('syncable.03.G dialog', function (t) {
    var stream = new BatStream();
    var pair = new StreamOpSource(stream.pair, {});
    var opstream = new StreamOpSource(stream, {});
    var sample_op = new Op('/Host#db+cluster!time1+user1~ssn.on', '', 'pair');

    t.plan(5);

    opstream.once('handshake', function (op) {
        t.equal(''+op.spec, '/Swarm#db+cluster!pair.on', 'spec matches');
        opstream.writeHandshake(new Op('/Swarm#db+cluster!stream.on', '', 'pair'));
        opstream.write(sample_op);
    });

    opstream.on('error', function (err) {
        t.fail('some error: '+err);
    });

    pair.once('handshake', function (op) {
        t.equal(''+op.spec, '/Swarm#db+cluster!stream.on', 'spec matches');
        pair.on('op', more_data);
    });

     function more_data(op) {
        t.equal(''+op.spec, ''+sample_op.spec, 'spec matches');
        t.equal(''+op.value, ''+sample_op.value, 'value matches');
        t.equal(op.source, 'stream', 'source is correct');
        t.end();
    }

    pair.writeHandshake(new Op('/Swarm#db+cluster!pair.on', '', 'stream'));
});


tape ('syncable.03.H write to a closed stream', function (t) {
    var stream = new BatStream();
    var opstream = new StreamOpSource(stream.pair);
    t.plan(3);

    opstream.on('handshake', function(op) {
        t.equal(op.origin(), 'swarm~ssn');
        t.equal(op.id(), 'db+cluster');
    });
    opstream.on('end', function () {
        t.ok(true, 'Got end event');
        opstream.writeHandshake(new Op('/Swarm#db+cluster!stream.on', '', 'pair'));
    });
    stream.write("/Swarm#db+cluster!stamp+swarm~ssn.on\t\n");
    stream.end();
});


tape ('syncable.03.I opstream write', function (t) {
    var stream = new BatStream();
    var opstream = new StreamOpSource(stream.pair, {syncFlush: false});

    stream.once('data', function (chunk) {
        t.equal(chunk.toString(), '/Swarm#db+cluster!stamp+swarm~ssn\t\n#stamp!time\t\n\n');
        stream.on('data', function (chunk) {
            t.fail(chunk.toString());
        });
    });
    stream.on('end', function () {
        t.end();
    });
    var parsed = Op.parse('/Swarm#db+cluster!stamp+swarm~ssn.on\t\n' +
                          '/Model#stamp!time.on\t\n');

    t.equal(parsed.ops.length, 2);
    opstream.writeHandshake(parsed.ops[0]);
    opstream.write(parsed.ops[1]);
    opstream.writeEnd();
});

// tape.skip('syncable.03.I stream .write()/.read() interface', function (t) {
//     var stream = new BatStream();
//     var pair = new StreamOpSource(stream.pair, {});
//     var opstream = new StreamOpSource(stream, {});
//     var op, index = 0;
//     var send_ops = Op.parse(
//         '/Model#id!time1+user1~ssn.on\t\n\n'+
//         '/Mode#some!time2+user2~ssn.set\t12345\n'+
//         '/Model#stamp+author!time3+user3~ssn.on\tpos\n'+
//                '\t!stamp+source.op\tvalue\n'+
//                '\t!stamp2+source2.op\tvalue2\n\n',
//         'pair'
//     ).ops;
//
//     function check_op(op) {
//         var next = send_ops[index++];
//         t.equal(''+op.spec, ''+next.spec, 'spec matches');
//         t.equal(''+op.value, ''+next.value, 'value matches');
//         t.equal(op.source, 'pair', 'source is correct');
//     }
//
//     t.plan(send_ops.length * 3 + 2);
//     pair.writeHandshake(new Op('/Swarm#db+cluster!pair.on', '', 'stream'));
//
//     pair.write(send_ops[0]);
//     pair.write(send_ops[1]);
//
//     while (op = opstream.read()) {
//         check_op(op);
//     }
//
//     t.equal(op, null, 'No more operations available for now');
//     t.equal(index, 2, 'Two operations processed');
//
//     pair.write(send_ops[2]);
//     check_op(opstream.read());
// }); FIXME revitalize!!!


// tape.skip('syncable.03.J patch: partial read', function (t) {
// });
