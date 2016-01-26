"use strict";
require('stream-url-node');
var Swarm = require('swarm-server');
var Client = require('swarm-client').Client;
var Gateway = require('swarm-gw').Gateway;
var Server = Swarm.Server;
var bat = require('swarm-bat');
var BatStream = bat.BatStream;
var util = require('../util');

var tape = require('tap').test;

Swarm.Host.multihost = true;

tape ('4.A Gateway: Local/Client updates', function (t) {
    var db_path = '.test_db.4A_' + (new Date().getTime());
    var client, testModel;
    var firstVersion, lastVersion;

    t.plan(9);

    function create_model() {
        t.ok(client, 'Expect the client to be instantiated');
        testModel = new Swarm.Model({key: 0}, client.host);
        t.pass('New model created: ' + testModel.typeid() + ' ' + testModel.version());

        firstVersion = testModel.version();
        for (var i = 1; i <= 10; i++) {
            testModel.set({key: i});
        }
        lastVersion = testModel.version();

        setTimeout(function () {
            t.pass('Closing the client...');
            client.close(function () {
                client = util.start_client(null, db_path, start_gateway);
            });
        }, 500);
    }

    var replies = 0;

    function start_gateway() {
        t.ok(client, 'Expect the client to be instantiated');
        t.ok(testModel.typeid(), 'Expect test model to be initialized');

        var stream = new BatStream();
        var gateway = new Gateway(client.host)
        gateway.addStream('teststream', stream.pair);

        stream.on('data', function (data) {
            var match = data.toString().match(/^(.*)!(.*)\.STATE\t(.*)\n$/);
            t.equals(testModel.typeid(), match[1], 'Object ID is correct');
            t.equals(lastVersion, match[2], 'Expect the latest version');
            t.equals('{"key":10}', match[3], 'Expect latest value');
            replies++;
            t.equals(1, replies, 'Expect a single reply');
        });
        stream.write(testModel.typeid() + '.ON\t{}\n');

        setTimeout(end_test, 1000);
    }

    function end_test() {
        client.close(function () {
            util.cleanup(db_path);
            t.end();
        });
    }

    client = util.start_client(null, db_path, create_model);
});

tape ('4.B Gateway: Remote/Server updates', function (t) {
    var server_db_path = util.prepare('.test_db.4B_server_' + (new Date().getTime()));
    var client_db_path = util.prepare('.test_db.4B_client_' + (new Date().getTime()));
    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var url = 'tcp://localhost:' + port;

    t.plan(9);

    var client, testModel;
    var firstVersion, lastVersion;
    var server = util.start_server(url, server_db_path, function () {
        var serverHost = util.create_server_host(server);
        testModel = new Swarm.Model({key: 0}, serverHost);
        t.pass('New model created: ' + testModel.typeid() + ' ' + testModel.version());

        firstVersion = testModel.version();
        for (var i = 1; i <= 10; i++) {
            testModel.set({key: i});
        }
        lastVersion = testModel.version();

        setTimeout(start_client, 1000);
    });

    function start_client() {
        t.pass('Connecting the client...');
        client = util.start_client(url, client_db_path, start_gateway);
    }

    var replies = 0;

    function start_gateway() {
        t.ok(client, 'Expect the client to be instantiated');
        t.ok(testModel.typeid(), 'Expect test model to be initialized');

        var stream = new BatStream();
        var gateway = new Gateway(client.host)
        gateway.addStream('teststream', stream.pair);

        stream.on('data', function (data) {
            var match = data.toString().match(/^(.*)!(.*)\.STATE\t(.*)\n$/);
            t.equals(testModel.typeid(), match[1], 'Object ID is correct');
            t.equals(lastVersion, match[2], 'Expect the latest version');
            t.equals('{"key":10}', match[3], 'Expect latest value');
            replies++;
            t.equals(1, replies, 'Expect a single reply');
        });
        stream.write(testModel.typeid() + '.ON\t{}\n');

        setTimeout(end_test, 1000);
    }

    function end_test() {
        t.pass('Closing the client...');
        client.close(function () {
            server.close(function () {
                util.cleanup(server_db_path);
                util.cleanup(client_db_path);
                t.end();
            });
        });
    }
});

tape ('4.C Gateway: Remote/Server updates deferred', function (t) {
    var server_db_path = util.prepare('.test_db.4B_server_' + (new Date().getTime()));
    var client_db_path = util.prepare('.test_db.4B_client_' + (new Date().getTime()));
    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var url = 'tcp://localhost:' + port;

    t.plan(8);

    var client, testModel;
    var firstVersion, lastVersion;
    var server = util.start_server(url, server_db_path, function () {
        var serverHost = util.create_server_host(server);
        testModel = new Swarm.Model({key: 0}, serverHost);
        t.pass('New model created: ' + testModel.typeid() + ' ' + testModel.version());

        firstVersion = testModel.version();
        for (var i = 1; i <= 10; i++) {
            testModel.set({key: i});
        }
        lastVersion = testModel.version();

        setTimeout(function () {
            server.close(function () {
                client = util.start_client(url, client_db_path, start_gateway);
            });
        }, 100);
    });

    var replies = 0;

    function start_gateway() {
        t.ok(client, 'Expect the client to be instantiated');
        t.ok(testModel.typeid(), 'Expect test model to be initialized');

        var stream = new BatStream();
        var gateway = new Gateway(client.host)
        gateway.addStream('teststream', stream.pair);

        stream.on('data', function (data) {
            var match = data.toString().match(/^(.*)!(.*)\.STATE\t(.*)\n$/);
            t.equals(testModel.typeid(), match[1], 'Object ID is correct');
            t.equals(lastVersion, match[2], 'Expect the latest version');
            t.equals('{"key":10}', match[3], 'Expect latest value');
            replies++;
            t.equals(1, replies, 'Expect a single reply');
        });
        stream.write(testModel.typeid() + '.ON\t{}\n');

        setTimeout(function () {
            t.equals(0, replies, 'Gateway cannot produce any reply without an upstream');
            server = util.start_server(url, server_db_path, function () {
                setTimeout(end_test, 1000);
            });
        }, 100);
    }

    function end_test() {
        client.close(function () {
            server.close(function () {
                util.cleanup(server_db_path);
                util.cleanup(client_db_path);
                t.end();
            });
        });
    }
});
