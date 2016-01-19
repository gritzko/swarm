"use strict";
require('stream-url-node');
require('stream-url-ws');

var fs = require('fs');
var rimraf = require('rimraf');
var Swarm = require('swarm-server');
var SwarmClient = require('swarm-client');
var Server = Swarm.Server;
var Client = SwarmClient.Client;
var bat = require('swarm-bat');
var level = require('level');
var memdown = require('memdown');

var tape  = require('tap').test;

Swarm.Host.multihost = true;

function on_upstream_connection(client, callback) {
    if (!callback) return;

    function check_if_upstream (op_stream) {
        if (op_stream.upstream) {
            callback();
        } else {
            client.replica.once('connection', check_if_upstream);
        }
    }
    client.replica.once('connection', check_if_upstream);
}

function start_client(url, ready_callback, connection_callback) {
    var client = new Client({
        ssn_id: 'swarm~0',
        db_id: 'testdb',
        db: level(memdown),
        connect: url,
        callback: function () {
            ready_callback && ready_callback();
        },
    });
    on_upstream_connection(client, connection_callback);
    return client;
}

function start_server(db_path, url, ready_callback) {
    var server = new Server({
        ssn_id: 'swarm~0',
        db_id: 'testdb',
        db_path: db_path,
        listen: url,
        callback: function () {
            ready_callback && ready_callback();
        },
    });
    return server;
}

function basic_reconnect_test(t, db_path, url) {
    t.plan(5);

    fs.existsSync(db_path) && rimraf.sync(db_path);

    var server = start_server(db_path, url);
    var client = start_client(url, null, function () {
        t.pass('Client is connected');
        setTimeout(restart, 100);
    });

    function restart() {
        t.pass('Restarting the server...');

        on_upstream_connection(client, function () {
            t.pass('Client is reconnected');
            end();
        });
        client.replica.once('disconnect', function () {
            t.pass('Client is disconnected');
        });

        server.close(function () {
            t.pass('Server is closed');
            server = start_server(db_path, url);
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
