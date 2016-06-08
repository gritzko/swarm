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

tape ('3.A Replay on client', function (t) {
    var db_path = '.test_db.3A_' + (new Date().getTime());
    var client, testModel;
    var firstVersion, lastVersion;

    t.plan(11);

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
                client = util.start_client(null, db_path, fetch_model);
            });
        }, 500);
    }

    function fetch_model() {
        t.ok(client, 'Expect the client to be instantiated');
        t.ok(testModel, 'Expect the test object to be instantiated');

        var sameModel = client.get(testModel.typeid());
        sameModel.onInit(function () {
            t.pass('Object initialized ' + sameModel.typeid() + ' ' + sameModel.version() + ' ' + sameModel.key);
            t.equals(firstVersion, sameModel.version(), 'init event corresponds to initial version');
            t.equals(0, sameModel.key, 'init events corresponds to initial value');

        });
        sameModel.on('change', function () {
            t.pass('Object updated ' + sameModel.typeid() + ' ' + sameModel.version() + ' ' + sameModel.key);
            t.equals(lastVersion, sameModel.version(), 'change event corresponds to final version');
            t.equals(10, sameModel.key, 'change event corresponds to final value');
            setTimeout(end_test, 100);
        });
    }

    function end_test() {
        client.close(function () {
            util.cleanup(db_path);
            t.end();
        });
    }

    client = util.start_client(null, db_path, create_model);
});

tape ('3.B Replay from server', function (t) {
    var server_db_path = util.prepare('.test_db.3B_server_' + (new Date().getTime()));
    var client_db_path = util.prepare('.test_db.3B_client_' + (new Date().getTime()));
    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var url = 'tcp://localhost:' + port;

    t.plan(11);

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
        client = util.start_client(url, client_db_path, fetch_model);
    }

    function fetch_model() {
        t.ok(client, 'Expect the client to be instantiated');
        t.ok(testModel, 'Expect the test object to be instantiated');

        var sameModel = client.get(testModel.typeid());
        sameModel.onInit(function () {
            t.pass('Object initialized ' + sameModel.typeid() + ' ' + sameModel.version() + ' ' + sameModel.key);
            t.equals(lastVersion, sameModel.version(), 'init event corresponds to last version');
            t.equals(10, sameModel.key, 'init event corresponds to last property value');


        });
        sameModel.on('change', function () {
            t.pass('Object updated ' + sameModel.typeid() + ' ' + sameModel.version() + ' ' + sameModel.key);
            t.equals(lastVersion, sameModel.version(), 'no real change in version');
            t.equals(10, sameModel.key, 'no real change in value');
        });
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
