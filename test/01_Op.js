"use strict";
var env = require('../lib/env');
var Spec = require('../lib/Spec');
var Op = require('../lib/Op');

env.debug = console.log;


test('01.A simple instantiation', function (test) {
    var op = new Op('/Type#id!ver.op', 'value', 'src');
    equal(op.source, 'src');
    equal(op.spec.op(), 'op');
    equal(op.value, 'value');
    var clone = new Op(op);
    equal(clone.source, 'src');
    equal(clone.spec.op(), 'op');
    equal(clone.value, 'value');
});

test('01.B simple serialization', function (test) {
    var op = new Op('/Type#id!ver.op', 'value', 'src');
    var str = op.toString();
    equal(str, '/Type#id!ver.op\tvalue\n');
    var parsed = Op.parse(str, 'source');
    equal(parsed.spec.constructor, Spec);
    equal(op.spec.constructor, Spec);
    equal(parsed.spec.toString(), op.spec.toString());
    equal(parsed.value, op.value);
    equal(parsed.source, 'source');
});
