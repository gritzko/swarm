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

    //tap.plan(4);

    bat.query('.STATE\t{"x":1}\n', function(response_str) {
        var response = Op.parse(response_str, 'src');
        tap.equal(response.ops.length, 1, 'returns the created object (only)');
        var reop = response.ops[0];
        tap.equal(reop.op(), 'STATE', 'it is a state op');
        tap.equal(reop.value, '{"x":1}', 'and the state is right');
        tap.ok(reop.stamp() > reop.id(), 'timestamp order is right');
        new_id = reop.id();

        bat.query('#'+new_id+'.OFF\t\n', function(off_response) {
            tap.equal(off_response, '', 'no response to .OFF');
            tap.end();
        });
    });

});

test('3.B Gateway - fetch', function (tap) {

    tap.plan(2);

    // TODO tolerant parsing .ON\n

    bat.query('#'+new_id+'.ON\t\n', function(response_str) {
        var response = Op.parse(response_str, 'src');
        if (response.ops.length!==1) {
            tap.fail('one op only');
            return;
        }
        var reop = response.ops[0];
        tap.equal(reop.op(), 'STATE', 'it is a state');
        tap.equal(reop.value, '{"x":1}', 'exactly as created');
        tap.end();
    });

});

test('3.C Gateway - change', function (tap) {

    tap.plan(3);

    var obj = host.logics.get('/Model#'+new_id);

    bat.query('#'+new_id+'.STATE\t{"x":2}\n', function(response_str) {
        var response = Op.parse(response_str, 'src');
        if (response.ops.length!==1) {
            tap.fail('one op only');
            return;
        }
        var reop = response.ops[0];
        tap.equal(reop.op(), 'STATE', 'it is a state');
        tap.equal(reop.value, '{"x":2}', 'exactly as we set it');
        tap.equal(obj.x, 2, 'the value is set server-side');
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
