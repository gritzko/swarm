"use strict";
var sync = require('..');
var Spec = sync.Spec;
var Op = sync.Op;
var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}

tape ('1.b basic specifier syntax', function (tap) {
    var testSpec = '/Class#ID!7Umum+gritzko~ssn.event';
    var spec = new Spec(testSpec);
    tap.equal(spec.version(),'7Umum+gritzko~ssn');
    tap.equal(spec.token('!').ext,'gritzko~ssn');
    tap.equal(spec.source(),'gritzko~ssn');
    tap.equal(spec.author(),'gritzko');
    var rev = spec.toString();
    tap.equal(rev,testSpec);
    var spec2 = new Spec(spec);
    tap.equal(spec.toString(),spec2.toString());
    var def = new Spec('/Type#id!ver.method');
    var over = def.set('#newid.newmethod');
    tap.equal(''+over, '/Type#newid!ver.newmethod', 'set() makes a well-formed spec');
    var abc = new Spec('!abc');
    tap.equal(abc.has('!ab'), false); // ?
    tap.equal(abc.has('!'), true);
    tap.end();
});


tape ('1.b.2 parsed specifier (scopes and defaults)', function (tap) {
    var spec = new Spec.Parsed('!stamp', '/Type#id', '.on');
    tap.equal(spec.toString(), '/Type#id!stamp.on', 'scope/default');
    tap.equal(spec.type(), 'Type');
    tap.equal(spec.id(), 'id');
    tap.equal(spec.stamp(), 'stamp');
    tap.equal(spec.op(), 'on');
    var spec2 = new Spec.Parsed('!stamp2.off',null,spec);
    tap.equal(spec2.toString(), '/Type#id!stamp2.off', 'default (parsed)');
    var spec3 = new Spec.Parsed('',null,spec);
    tap.equal(spec3.toString(), spec.toString());
    var spec4 = new Spec.Parsed(spec2);
    tap.equal(spec4.toString(), spec2.toString());
    tap.end();
});

tape('1.c spec filters', function (tap) {
    var filter = '.on';
    tap.equal (new Spec('!abc.on/Class').fits(filter), true);
    tap.equal (new Spec('.off/Class').fits(filter), false);
    tap.equal (new Spec('/Type!abc.off.on').fits(filter), true);
    tap.end();
});


tape('1.e corner cases', function (tap) {
    var empty = new Spec('');
    tap.equal(empty.type()||empty.id()||empty.op()||empty.version(),'');
    tap.equal(empty.toString(),'');
    var action = new Spec('.on+re');
    tap.equal(action.op(),'on+re');
    var fieldSet = new Spec('/TodoItem#7AM0f+gritzko!7AMTc+gritzko.set');
    tap.equal(fieldSet.type(),'TodoItem', 'type()');
    tap.equal(fieldSet.id(),'7AM0f+gritzko', 'id()');
    tap.equal(fieldSet.version(),'7AMTc+gritzko', 'version()');
    tap.equal(fieldSet.op(),'set');
    tap.end();
});


tape('1.f op regexes', function (t) {
    var reSpec = new RegExp(Op.rsSpec);
    t.ok(reSpec.test('/Swarm#db!stamp+user~ssn.on'), '.on spec');
    Op.reOp.lastIndex = 0;
    t.ok(Op.reOp.exec('/Swarm#db!stamp+user~ssn.on\ta b c\n\n'), 'empty .on');
    Op.reOp.lastIndex = 0;
    t.ok(Op.reOp.exec('/Model#id!stamp+user~ssn.set\t{"a":"b"}\n'), 'set');
    Op.reOp.lastIndex = 0;
    t.ok(Op.reOp.exec('/Swarm#db!stamp+user~ssn.on\tabc\n'+
        '\t!time0.set {}\n' +
        '\t!time1.set {"x":"y"}\n' +
        '\n'), '.on patch');
    t.end();
});


tape ('1.g parse ops', function (tap) {

    var parsed = Op.parse (
        '/Model#test!timeX+author~ssn.on\t\n'+
            '\t!time0.set\t{"x":1}\n' +
            '\t!time1.set\t{"y":2}\n\n' +
        '/Model#id!stamp.set\t{"x":"y"}\n' +
        '/Model#other!stamp.on\t\n\n' );
    tap.equal(parsed.ops.length, 3);
    var diff = parsed.ops[0];
    var set = parsed.ops[1];
    var short_on = parsed.ops[2];

    tap.equal(set.name(), 'set');
    tap.equal(set.value, '{"x":"y"}');

    tap.equal(diff.origin(), 'author~ssn', 'originating session');
    tap.equal(diff.stamp(), 'timeX+author~ssn', 'lamport timestamp');
    tap.equal(diff.author(), 'author', 'author (user id)');
    tap.equal(diff.id(), 'test', '#id');
    tap.equal(diff.op(), 'on', 'op()');
    tap.equal(''+diff.version(), '!timeX+author~ssn', 'version');
    tap.ok(diff.patch, 'patch');
    tap.equal(diff.patch.length, 2);
    tap.equal(diff.patch[0].spec+'', '/Model#test!time0.set');
    tap.equal(diff.patch[1].spec+'', '/Model#test!time1.set');
    tap.equal(diff.patch[1].value, '{"y":2}');

    tap.equal(diff.toString(),
        '/Model#test!timeX+author~ssn.on\t\n' +
            '\t!time0.set\t{"x":1}\n' +
            '\t!time1.set\t{"y":2}\n\n',
        'diff serialization');

    tap.equal(short_on.toString(), '/Model#other!stamp.on\t\n\n');
    tap.equal(short_on.value, '');
    tap.equal(short_on.name(), 'on');
    tap.equal(short_on.patch, null);

    tap.end();

});


// be conservative in what you send, liberal in what you accept
tape('1.h parse strange ops', function (tap) {

    var bad_hs = "/Swarm+Replica#db!00000+user~ssn.on null\n !null.last_ds_ssn -1\n\n";
    var op = new Op(bad_hs);
    tap.equal(op.stamp(), '00000+user~ssn');
    tap.equal(op.origin(), 'user~ssn');
    tap.equal(op.op(), 'on');
    tap.equal(op.value, 'null');
    tap.equal(op.patch.length, 1);
    tap.equal(op.patch[0].op(), 'last_ds_ssn');
    tap.equal(op.patch[0].stamp(), 'null');
    tap.equal(op.patch[0].value, '-1');
    tap.equal(op.patch[0].id(), 'db');
    tap.end();

});


tape('1.i spanning tree', function (tap) {
    tap.ok(Spec.inSubtree('ssn~child~1', 'ssn'));
    tap.ok(Spec.inSubtree('ssn~child~1', 'ssn~child'));
    tap.notOk(Spec.inSubtree('ssn~child~1', 'ssn~another'));
    tap.notOk(Spec.inSubtree('alice~1', 'bob~1'));
    tap.notOk(Spec.inSubtree('alice~1', 'bob'));
    tap.notOk(Spec.inSubtree('alice', 'bob~1'));
    tap.notOk(Spec.inSubtree('alice', 'bob'));
    tap.notOk(Spec.inSubtree('alicebuttheotherone', 'alice'));
    tap.end();
});
