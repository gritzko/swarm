"use strict";
var Swarm = require('..');
var Gateway = Swarm.Gateway;
var Syncable = Swarm.Syncable;
var tape = require('tap').test;

var bat = require('swarm-bat');
var BatStream = bat.BatStream;

function createHost() {
    return new Swarm.Host({
        ssn_id: 'anon',
        db_id: 'db',
    });
}

tape ('Gateway.1.A.empty model', function (tap) {
    var stream = new BatStream();

    var host = createHost();
    var gateway = new Gateway(host);
    gateway.addStream('stream1', stream.pair);

    stream.write('/Model.STATE\t{}\n');
    stream.on('data', function (data) {
        var reply = data.toString();
        tap.ok(/\/Model#[\d\w]+\+anon![\d\w]+\+anon\.STATE\t{}\n$/.test(reply),
               'Proper reply for an empty model');
        host.close();
        tap.end();
    });
});

tape ('Gateway.1.B.nonempty model', function (tap) {
    var stream = new BatStream();

    var host = createHost();
    var gateway = new Gateway(host);
    gateway.addStream('stream1', stream.pair);

    stream.write('/Model.STATE\t{"key":"value"}\n');
    stream.on('data', function (data) {
        var reply = data.toString();
        tap.ok(/\/Model#[\d\w]+\+anon![\d\w]+\+anon\.STATE\t{"key":"value"}\n$/.test(reply),
               'Proper reply for given initial state');

        host.close();
        tap.end();
    });
});

tape ('Gateway.1.C.two streams', function (tap) {
    var stream1 = new BatStream();
    var stream2 = new BatStream();

    var host = createHost();
    var gateway = new Gateway(host);
    gateway.addStream('stream1', stream1.pair);
    gateway.addStream('stream2', stream2.pair);

    var subscribed = 0;
    stream1.write('/Model.STATE\t{"key":"value"}\n');
    stream1.on('data', function (data) {
        var reply = data.toString();
        var msg = reply.split('\t')[0].split('.')[0] + '.ON\t\n';
        stream2.write(msg);
        subscribed = 1;
    });
    stream2.on('data', function (data) {
        var reply = data.toString();
        tap.ok(subscribed, 'Received a message on second stream after subscription');
        tap.ok(/\/Model#[\d\w]+\+anon![\d\w]+\+anon\.STATE\t{"key":"value"}\n$/.test(reply),
               'Proper reply for given initial state');

        host.close();
        tap.end();
    });
});

tape ('Gateway.1.D.created through host', function (tap) {
    var stream = new BatStream();

    var host = createHost();
    var gateway = new Gateway(host);
    gateway.addStream('stream', stream.pair);

    var obj = host.get('/Model');
    obj.onInit(function () {
        obj.set({key: 'test value'});
        stream.write('/Model#' + obj._id + '.ON\t\n');
        stream.on('data', function (data) {
            var reply = data.toString();
            var json = JSON.parse(reply.split('\t')[1]);
            tap.equal(json.key, 'test value');
            host.close();
            tap.end();
        });
    });
});

tape ('Gateway.1.E.updated through gateway', function (tap) {
    var stream = new BatStream();

    var host = createHost();
    var gateway = new Gateway(host);
    gateway.addStream('stream', stream.pair);

    var obj = host.get('/Model');
    obj.onInit(function () {
        stream.write('/Model#' + obj._id + '.STATE\t{"key":"another value"}\n');
    });
    obj.on('change', function () {
        tap.equal(obj['key'], 'another value');
        host.close();
        tap.end();
    });
});
