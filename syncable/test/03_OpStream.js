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

tape('3.A corner cases', function (t) {
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

    opstream.on('op', function(op) {
        var next = expect_ops.pop();
        t.equal(''+op.spec, ''+next.spec, 'spec matches');
        t.equal(''+op.value, ''+next.value, 'value matches');
        t.equal(op.source, 'pair');
    });

    while (send_ops.length) {
        var op = send_ops.shift();
        expect_ops.unshift(op);
        pair.write(op);
    }
});
