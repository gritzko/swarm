"use strict";
var sync = require('..');
var Op = sync.Op;
var OpStream = sync.OpStream;
var bat = require('swarm-bat');
var BatStream = bat.BatStream;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}

tape ('syncable.03.A simple cases', function (t) {
    var stream = new BatStream();

    var pair = new OpStream(stream.pair, {});
    var opstream = new OpStream(stream, {});

    var send_ops = Op.parse(
        '/Host#db+cluster!time1+user1~ssn.on\t\n\n'+
        '/Host#db+cluster!time2+user2~ssn.set\t12345\n'+
        '/Model#stamp+author!time3+user3~ssn.on\tpos\n'+
               '\t!stamp+source.op\tvalue\n'+
               '\t!stamp2+source2.op\tvalue2\n\n',
        'pair'
    ).ops;
    var expect_ops = [], i=1;

    t.plan(send_ops.length*4);

    opstream.source = 'pair';

    opstream.on('data', function(op) {
        var next = expect_ops.pop();
        t.equal(''+op.spec, ''+next.spec, 'spec matches ('+(i++)+')');
        t.equal(''+op.value, ''+next.value, 'value matches');
        t.equal(op.source, 'pair', 'source is correct');
        t.deepEqual(op.patch, next.patch, 'patch matches');
    });

    //pair.sendHandshake(new Op('/Swarm#db+cluster!pair.on', '', 'stream'));

    while (send_ops.length) {
        var op = send_ops.shift();
        expect_ops.unshift(op);
        pair.write(op);
        pair.flush(); // keepalive must cause no reaction
    }
});

tape ('syncable.03.B defragmentation', function (t) {
    var stream = new BatStream();
    var opstream = new OpStream(stream.pair, {source: 'pair'});
    var op = new Op('/Swarm#db+cluster!stream.on', '', 'pair');
    var str = op.toString();

    t.plan(2);

    opstream.on('data', function(recv_op){
        t.equal(''+recv_op.spec, ''+op.spec, 'spec matches');
        t.equal(recv_op.value, op.value, 'value matches');
    });
    for (var i = 0; i < str.length; i++) {
        stream.write(str.charAt(i));
    }
});

tape ('syncable.03.C error', function (t) {
    var stream = new BatStream();
    var opstream = new OpStream(stream.pair, {});
    t.plan(1);
    opstream.on('data', function(recv_op){
        t.fail('no ops here');
    });
    opstream.on('error', function(msg) {
        t.pass(msg);
    });
    stream.write("!не операция\n");
});

tape ('syncable.03.D handshake', function (t) {
    var stream = new BatStream();
    var opstream = new OpStream(stream.pair);
    t.plan(4);
    opstream.once('data', function(hs_op) {
        t.equal(hs_op.origin(), 'swarm~ssn');
        t.equal(hs_op.id(), 'db+cluster');
        opstream.source = hs_op.stamp();
        opstream.on('data', more_data);
    });
    function more_data(recv_op){
        t.equal(recv_op.source, 'stamp+swarm~ssn');
        t.equal(''+recv_op.spec, '/Model#stamp!time.on');
    }
    opstream.on('error', function(msg) {
        t.fail('no error here');
    });
    stream.write("/Swarm#db+cluster!stamp+swarm~ssn.on\t\n");
    stream.write("/Model#stamp!time.on\t\n");
});

tape ('syncable.03.E destroy()', function (t) {
    var stream = new BatStream();
    var opstream = new OpStream(stream.pair);
    t.plan(1);
    opstream.once('data', function(recv_op){
        t.ok(recv_op.stamp(), 'time', '1st op OK');
        opstream.destroy();
        opstream.on('data', function(){
            t.fail('destroyed');
        });
    });
    opstream.on('error', function(msg) {
        t.fail('no errors');
    });
    stream.write("/Model#stamp!time.on\t\n");
    stream.write("/Model#stamp!more.on\t\n");
});


tape ('syncable.03.F stream end', function (t) {
    var stream = new BatStream();
    var opstream = new OpStream(stream.pair);
    t.plan(3);

    opstream.once('data', function(hs_op) {
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
    var pair = new OpStream(stream.pair, {});
    var opstream = new OpStream(stream, {});
    var sample_op = new Op('/Host#db+cluster!time1+user1~ssn.on', '', 'pair');

    t.plan(5);

    opstream.once('data', function (op) {
        t.equal(''+op.spec, '/Swarm#db+cluster!pair.on', 'spec matches');
        opstream.sendHandshake(new Op('/Swarm#db+cluster!stream.on', '', 'pair'));
        opstream.write(sample_op);
    });

    pair.once('data', function (op) {
        t.equal(''+op.spec, '/Swarm#db+cluster!stream.on', 'spec matches');
        pair.source = 'stream';
        pair.on('data', more_data);
    });

     function more_data(op) {
        t.equal(''+op.spec, ''+sample_op.spec, 'spec matches');
        t.equal(''+op.value, ''+sample_op.value, 'value matches');
        t.equal(op.source, 'stream', 'source is correct');
    }

    pair.sendHandshake(new Op('/Swarm#db+cluster!pair.on', '', 'stream'));
});


tape ('syncable.03.H write to a closed stream', function (t) {
    var stream = new BatStream();
    var opstream = new OpStream(stream.pair);
    t.plan(3);

    opstream.on('data', function(op) {
        t.equal(op.origin(), 'swarm~ssn');
        t.equal(op.id(), 'db+cluster');
    });
    opstream.on('end', function () {
        t.ok(true, 'Got end event');
        opstream.sendHandshake(new Op('/Swarm#db+cluster!stream.on', '', 'pair'));
    });
    stream.write("/Swarm#db+cluster!stamp+swarm~ssn.on\t\n");
    stream.end();
});


tape.skip('syncable.03.I stream .write()/.read() interface', function (t) {
    var stream = new BatStream();
    var pair = new OpStream(stream.pair, {});
    var opstream = new OpStream(stream, {});
    var op, index = 0;
    var send_ops = Op.parse(
        '/Model#id!time1+user1~ssn.on\t\n\n'+
        '/Mode#some!time2+user2~ssn.set\t12345\n'+
        '/Model#stamp+author!time3+user3~ssn.on\tpos\n'+
               '\t!stamp+source.op\tvalue\n'+
               '\t!stamp2+source2.op\tvalue2\n\n',
        'pair'
    ).ops;

    function check_op(op) {
        var next = send_ops[index++];
        t.equal(''+op.spec, ''+next.spec, 'spec matches');
        t.equal(''+op.value, ''+next.value, 'value matches');
        t.equal(op.source, 'pair', 'source is correct');
    }

    t.plan(send_ops.length * 3 + 2);
    pair.sendHandshake(new Op('/Swarm#db+cluster!pair.on', '', 'stream'));

    pair.write(send_ops[0]);
    pair.write(send_ops[1]);

    while (op = opstream.read()) {
        check_op(op);
    }

    t.equal(op, null, 'No more operations available for now');
    t.equal(index, 2, 'Two operations processed');

    pair.write(send_ops[2]);
    check_op(opstream.read());
});


tape.skip('syncable.03.J patch: partial read', function (t) {
});
