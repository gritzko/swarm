"use strict";

require('stream-url-node');
require('stream-url-ws');

var fs = require('fs');
var rimraf = require('rimraf');
var Swarm = require('swarm-server');
var util = require('../util');

var tape = require('tap').test;

Swarm.Host.multihost = true;

function basic_reconnect_test(t, db_path, url) {
    t.plan(5);

    fs.existsSync(db_path) && rimraf.sync(db_path);

    var server = util.start_server(url, db_path);
    var client = util.start_client(url, null, null, function () {
        t.pass('Client is connected');
        setTimeout(restart, 100);
    });

    function restart() {
        t.pass('Restarting the server...');

        util.on_upstream_connection(client, function () {
            t.pass('Client is reconnected');
            end();
        });
        client.replica.once('disconnect', function () {
            t.pass('Client is disconnected');
        });

        server.close(function () {
            t.pass('Server is closed');
            server = util.start_server(url, db_path);
        });
    }

    function end() {
        client.close(function () {
            server.close(function () {
                fs.existsSync(db_path) && rimraf.sync(db_path);
                t.end();
            });
        });
    }
}

tape ('2.A Client reconnects (using tcp)', function (t) {
    var db_path = '.test_db.2A_' + (new Date().getTime());
    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var url = 'tcp://localhost:' + port;

    basic_reconnect_test(t, db_path, url);
});

tape ('2.B Client reconnects (using websockets)', function (t) {
    var db_path = '.test_db.2B_' + (new Date().getTime());
    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var url = 'ws://localhost:' + port;

    basic_reconnect_test(t, db_path, url);
});

tape ('2.C Object updated after reconnect', function (t) {
    var db_path = '.test_db.2C_' + (new Date().getTime());
    fs.existsSync(db_path) && rimraf.sync(db_path);

    var port = 40000 + ((process.pid^new Date().getTime()) % 10000);
    var url = 'tcp://localhost:' + port;

    var clientModel, serverModel, serverHost, connectionStamp;
    var server = util.start_server(url, db_path, function () {
        serverHost = util.create_server_host(server);
    });
    var client = util.start_client(url, null, null, function (op_stream_details) {
        t.pass('Client is connected');
        connectionStamp = op_stream_details.stamp;
        create_model();
    });

    function create_model() {
        clientModel = new Swarm.Model({key: 'initial'}, client.host);
        t.pass('Model created: ' + clientModel.typeid() + ' ' + clientModel.version());
        setTimeout(fetch_model, 500);
    }

    function fetch_model() {
        t.pass('Create an instance ' + clientModel.typeid() + ' on the server...');
        serverModel = serverHost.get(clientModel.typeid());
        t.pass('Server model created ' + serverModel.typeid() + ' ' + serverModel.version());
        serverModel.on('init', function () {
            t.pass('Server model is initialized');
        });
        serverModel.on('change', function () {
            t.pass('Server model is changed ' + serverModel.version() + ' ' + serverModel.key);
            t.equal(serverModel.version(), clientModel.version(), 'Versions should match');
            t.equal(serverModel.key, clientModel.key, 'Property value should match');
            reconnect();
        });
    }

    function reconnect() {
        util.on_upstream_connection(client, update);
        // Drop the connection forcing the client to reconnect
        client.replica.removeStream(connectionStamp);
    }

    function update() {
        t.pass('Client is re-connected, do an update from client side...');
        clientModel.set({key: 'updated'});
        t.equal(clientModel.key, 'updated', 'Expect the property to be updated');
        setTimeout(verify, 1000);
    }

    function verify() {
        t.pass('Verify an object ' + clientModel.typeid() + ' is updated on the server...');
        t.equal(serverModel.version(), clientModel.version(), 'Versions should match');
        t.equal(serverModel.key, 'updated', 'Expect the "key" property to be updated on the server');

        end();
    }

    function end() {
        client.close(function () {
            server.close(function () {
                fs.existsSync(db_path) && rimraf.sync(db_path);
                t.end();
            });
        });
    }
});
