"use strict";
var Swarm = require('..');
var Gateway = Swarm.Gateway;
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
        tap.match(data.toString(),
                  /\/Model#[\d\w~]+\+anon![\d\w~]+\+anon\.STATE\t{}\n$/);
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
        tap.match(data.toString(),
                  /\/Model#[\d\w~]+\+anon![\d\w~]+\+anon\.STATE\t{"key":"value"}\n$/);
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
        tap.match(reply,
                  /\/Model#[\d\w~]+\+anon![\d\w~]+\+anon\.STATE\t{"key":"value"}\n$/,
                  'Proper reply for given initial state');
        host.close();
        tap.end();
    });
});

tape ('Gateway.1.D.created through host', function (tap) {
    var stream = new BatStream();
    var received = 0;
    var host = createHost();
    var gateway = new Gateway(host);
    gateway.addStream('stream', stream.pair);

    var obj = host.get('/Model');
    // Locally created object is immediately ready, no need to use onInit
    obj.set({key: 'test value'});

    stream.write('/Model#' + obj._id + '.ON\t\n');
    stream.on('data', function (data) {
        var reply = data.toString();
        var json = JSON.parse(reply.split('\t')[1]);
        tap.equal(json.key, 'test value');
        received += 1;
    });
    setTimeout(function () {
        tap.equal(received, 1, 'Expect to receive exactly one reply');
        host.close();
        tap.end();
    }, 100);
});

tape ('Gateway.1.E.updated through gateway', function (tap) {
    var stream = new BatStream();
    var received = 0;
    var host = createHost();
    var gateway = new Gateway(host);
    gateway.addStream('stream', stream.pair);

    var obj = host.get('/Model');
    obj.on('change', function () {
        tap.equal(obj['key'], 'another value');
        received += 1;
    });
    stream.write('/Model#' + obj._id + '.STATE\t{"key":"another value"}\n');
    setTimeout(function () {
        tap.equal(received, 1, 'Expect to receive exactly one change event');
        host.close();
        tap.end();
    }, 100);
});

tape ('Gateway.1.F.add and remove stream', function (tap) {
    var received1 = 0, received2 = 0;
    var host = createHost();
    var gateway = new Gateway(host);

    var obj = host.get('/Model');
    obj.set({key: 'initial value'});

    var stream1 = new BatStream();
    var stream2 = new BatStream();
    gateway.addStream('stream1', stream1.pair);

    stream1.write('/Model#' + obj._id + '.ON\t\n');
    stream1.on('data', function (data) {
        tap.equal(JSON.parse(data.toString().split('\t')[1]).key,
                  'initial value');
        received1 += 1;
        gateway.removeStream('stream1');
        gateway.addStream('stream2', stream2.pair);
        stream2.write('/Model#' + obj._id + '.ON\t\n');
    });
    stream2.on('data', function (data) {
        tap.equal(JSON.parse(data.toString().split('\t')[1]).key,
                  'initial value');
        received2 += 1;
    });
    setTimeout(function () {
        tap.equal(received1, 1, 'Expect to receive exactly one reply in first stream');
        tap.equal(received2, 1, 'Expect to receive exactly one reply in second stream');
        host.close();
        tap.end();
    }, 100);
});

tape ('Gateway.1.G.exceptions', function (tap) {
    var stream = new BatStream();
    var host = createHost();
    var gateway = new Gateway(host);
    gateway.addStream('stream', stream.pair);

    var obj = host.get('/Model');
    stream.write('/Model#' + obj._id + '.STATE\t{"malformed_key":"something"}\n');
    setTimeout(function () {
        host.close();
        tap.end();
    }, 100);
});
