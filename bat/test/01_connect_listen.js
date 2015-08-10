"use strict";
var su = require('stream-url');
var bat = require('..'); // register loopback:

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.stream(tape);
}

tape ('1.A listen-connect loopback stream', function (t) {
    t.plan(3);
    var server = su.listen('loopback:string', function(stream) {
        t.ok(true, 'incoming connection');
        stream.write('OK');
        stream.end();
    });
    var one = su.connect('loopback:string', function (stream) {
        stream.on('data', function (data) {
            t.equal(''+data, 'OK', 'data match');
        });
        stream.on('end', function (){
            t.ok(true, 'stream ends'); // TODO
        });
    });
});
