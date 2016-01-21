'use strict';
var Swarm = require('swarm-server');
var Client = require('swarm-client').Client;
var Server = Swarm.Server;
var Host = Swarm.Host;
var level = require('level');
var memdown = require('memdown');

function on_upstream_connection(client, callback) {
    if (!callback) return;

    function check_if_upstream (op_stream) {
        if (op_stream.upstream) {
            callback(op_stream);
        } else {
            client.replica.once('connection', check_if_upstream);
        }
    }
    client.replica.once('connection', check_if_upstream);
}

function start_client(url, db_path, ready_callback, connection_callback) {
    var client = new Client({
        ssn_id: 'dave~1',
        db_id: 'testdb',
        db: level(db_path == null ? memdown : db_path),
        connect: url,
        callback: function () {
            ready_callback && ready_callback();
        },
    });
    on_upstream_connection(client, connection_callback);
    return client;
}

function start_server(url, db_path, ready_callback) {
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

function create_server_host(server) {
    var host = new Host({
        ssn_id: server.snapshot_slave.ssn_id,
        db_id: server.snapshot_slave.db_id,
    });
    server.replica.addOpStreamDown(host);
    host.go();
    return host;
}

module.exports = {
    on_upstream_connection: on_upstream_connection,
    start_client: start_client,
    start_server: start_server,
    create_server_host: create_server_host,
};
