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

tape('3.A simple cases', function (t) {
    var stream = new BatStream();

    var pair = new OpStream(stream.pair, 'stream', {});
    var opstream = new OpStream(stream, 'pair', {});

    var send_ops = [
        new Op('/Host#db+cluster!time1+user1~ssn.on', '', 'stream'),
        new Op('/Host#db+cluster!time2+user2~ssn.on', '12345', 'stream'),
        new Op('/Model#stamp+author!time3+user3~ssn.diff',
            '\t!stamp+source.op\tvalue\n'+
            '\t!stamp2+source2.op\tvalue2\n'+
            '\n',  // FIXME
            'stream')
    ];
    var expect_ops = [];

    t.plan(send_ops.length*3);

    opstream.on('data', function(op) {
        var next = expect_ops.pop();
        t.equal(''+op.spec, ''+next.spec, 'spec matches');
        t.equal(''+op.value, ''+next.value, 'value matches');
        t.equal(op.source, 'pair', 'source is correct');
    });

    pair.sendHandshake(new Op('/Swarm#db+cluster!pair.on', '', 'stream'));

    while (send_ops.length) {
        var op = send_ops.shift();
        expect_ops.unshift(op);
        pair.write(op);
        pair.flush(); // keepalive must cause no reaction
    }
});

tape('3.B defragmentation', function (t) {
    var stream = new BatStream();
    var opstream = new OpStream(stream.pair, 'stream', {});
    var op = new Op('/Swarm#db+cluster!stream.on', '', 'pair');
    var str = op.toString();
    t.plan(2);
    opstream.on('id', function(recv_op){
        t.equal(''+recv_op.spec, ''+op.spec, 'spec matches');
        t.equal(recv_op.value, op.value, 'value matches');
    });
    for(var i=0; i<str.length; i++) {
        stream.write(str.charAt(i));
    }
});

tape('3.C error', function (t) {
    var stream = new BatStream();
    var opstream = new OpStream(stream.pair, 'stream', {});
    t.plan(1);
    opstream.on('data', function(recv_op){
        t.fail('no ops here');
    });
    opstream.on('error', function(msg) {
        t.pass(msg);
    });
    stream.write("!не операция\n");
});

tape('3.D handshake', function (t) {
    var stream = new BatStream();
    var opstream = new OpStream(stream.pair, undefined);
    t.plan(4);
    opstream.on('data', function(recv_op){
        t.equal(recv_op.source, 'stamp+swarm~ssn');
        t.equal(''+recv_op.spec, '/Model#stamp!time.on');
    });
    opstream.on('id', function(id, op) {
        t.equal(opstream.peer_ssn_id, 'swarm~ssn');
        t.equal(opstream.peer_db_id, 'db+cluster');
    });
    opstream.on('error', function(msg) {
        t.fail('no error here');
    });
    stream.write("/Swarm#db+cluster!stamp+swarm~ssn.on\t\n");
    stream.write("/Model#stamp!time.on\t\n");
});

tape('3.E handshake error', function (t) {
    var stream = new BatStream();
    var opstream = new OpStream(stream.pair);
    t.plan(1);
    opstream.on('data', function(recv_op){
        t.fail('no valid data here');
    });
    opstream.on('id', function(spec) {
        t.fail('handshake must fail');
    });
    opstream.on('error', function(msg) {
        t.equal(opstream.id, undefined, 'no handshake');
    });
    stream.write("/Model#stamp!time.on\t\n");
});

tape.skip('3.F stream end', function (t) {
});
