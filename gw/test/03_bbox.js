"use strict";
var Swarm = require("../.."); // FIXME multipackage
var Op = Swarm.Op;
var Gateway = require("../");

var TestClock = require('../../lib/TestClock');

var BAT = require('test-bat');
var BatStream = BAT.BatStream;
var StreamTest = BAT.StreamTest;

var test = require('tape');

var storage = new Swarm.Storage();
var host = new Swarm.Host('loc~al', 0, storage);
host.clock = new TestClock(host.id);

var gw = new Gateway(host.logics);

// gw.listen('bat:3A');
// NO MUX var mux = new bat.BatMux('mux', 'bat:3A');

var stream = new BatStream();
gw.addStream('time+client', stream);
var bat = new StreamTest(stream.pair);

var new_id;

test('3.A Gateway - create', function (tap) {

    tap.plan(4);

    bat.query('.STATE\t{"x":1}\n', function(response_str) {
        var response = Op.parse(response_str, 'src');
        tap.equal(response.ops.length, 1);
        if (response.ops.length == 1) {
            var reop = response.ops[0];
            tap.equal(reop.value, '{"x":1}');
            tap.equal(reop.op(), 'STATE');
            tap.ok(reop.stamp() > reop.id());
            new_id = reop.id();
        }
        tap.end();
    });

});

test('3.B Gateway - update', function (tap) {

    tap.plan(4);

    bat.query('#'+new_id+'.STATE\t{"x":2}\n', function(response_str) {
        var response = Op.parse(response_str, 'src');
        if (response.ops.length!==1) {
            tap.fail();
            return;
        }
        var reop = response.ops[0];
        tap.equal(reop.value, '{"x":2}');
        tap.equal(reop.op(), 'STATE');
        tap.equal(reop.id(), new_id);
        tap.ok(reop.stamp() > new_id);
    });

});
