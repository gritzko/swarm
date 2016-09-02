"use strict";
const swarm = require('swarm-protocol');
const Op = swarm.Op;
const NodeOpStream = require('../src/NodeOpStream');
const bat = require('swarm-bat');
const tape = require('tap').test;

tape ('server.00.A simple cases', function (t) {

    var stream = new bat.LoopbackStream();

    var opstream = new NodeOpStream(stream.pair);

    let frame =
        '/Swarm#test!0.on\n'+
        '/Model#stamp+author!time3+user3~ssn.set\t{"x":1}\n'+
        '\n\n';

    var ops = Op.parseFrame(frame);

    t.equal(ops.length, 2, 'parse is OK');

    opstream.on( op => {
        if (ops.length)
            t.equals(op.toString(), ops.shift().toString());
        else
            t.ok(op===null);
    });

    opstream.on(null, () => {
        t.equals(ops.length, 0);
        t.end();
    });

    for(let i=0; i<frame.length; i++)
        stream.write(frame[i]);
    stream.end();

});


/*

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
            t.equal(chunk.toString(), '.off\t\n');
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
*/
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
