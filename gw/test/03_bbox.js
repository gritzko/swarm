"use strict";
var Swarm = require("../.."); // FIXME multipackage
var Op = Swarm.Op;
var Gateway = require("../");

var TestClock = require('../../lib/TestClock');
var BAT = require('test-bat');
var BatStream = BAT.BatStream;
var StreamTest = BAT.StreamTest;

var test = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom(test);
}

var storage = new Swarm.Storage();
var host = new Swarm.Host('loc~al', 0, storage);
host.clock = new TestClock(host.id);

var gw = new Gateway(host.logics);

// gw.listen('bat:3A');
// NO MUX var mux = new bat.BatMux('mux', 'bat:3A');

var stream = new BatStream();
gw.addStream('test_stream', stream);
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
        /*tap.ok(false, 'bogus');
        tap.deepEqual({a:1, b:2}, {b:2});
        tap.equal(
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa aaaaa\n  aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa aaaAaa\naaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        );*/
        tap.equal(reop.id(), new_id);
        tap.ok(reop.stamp() > new_id);
        tap.end();
    });

});

if (typeof(require)==='function' && require('net') &&
        typeof(require('net').createServer)==='function') {
    test('3.C Gateway TCP server', tcp_test);
} else {
    test.skip('3.C Gateway TCP server', tcp_test);
}

var server;
var sock;

function tcp_test (tap) {
    tap.plan(11);
    var syncable = host.logics.create('Model');
    syncable.set({x:0});
    var net = require('net');
    var port = 10000 + (new Date().getTime())%1000;
    server = net.createServer (on_connection);
    server.listen(port, 'localhost', start_tcp);
    function start_tcp(err) {
        sock = net.connect(port, 'localhost', start_test);
    }
    function on_connection(conn) {
        conn.write('.ON\t\n');
        gw.addStream('tcp_stream', conn);
    }
    function start_test () {
        sock.on('data', on_server_msg);
        sock.write(syncable.spec()+'.ON\t\n');
    }
    function on_server_msg (data) {
        console.log('RECV', data.toString());
        var m = /"x":\s*(\d+)/.exec(data.toString());
        if (m) {
            var x = parseInt(m[1]);
            tap.equal(x, syncable.x);
            if (x<10) {
                syncable.set({x: x+1 });
            } else {
                sock.destroy();
                server.close(function(){
                    tap.end();
                });
            }
        }
    }
}
