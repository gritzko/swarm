"use strict";
var Replica = require('swarm-replica');
var sync = require('swarm-syncable');
var Host = sync.Host;
var level = require('level');
require('stream-url-ws');

// The class is just a convenience wrapper that starts a server-side Replica+
// Host combo where the Host is mostly used for op log aggregation.
// TODO add REST API for state bundles (Replica->Host->REST API)
function Server (options) {
    this.options = options;
    if (!options.ssn_id) {
        options.ssn_id = options.user_id || 'swarm';
    }
    if (!options.db_id) {
        options.db_id = '*';
    }
    if (!options.listen) {
        options.listen = 'ws://localhost:8000';
    }

    var db = level(options.db_path || '.');

    // BIG TODO: propagate ssn grant replica->host

    this.slave = new Host({ // Host constructor is synchronous
        ssn_id: options.ssn_id,
        db_id:  options.db_id,
        clock:  options.clock
    });

    this.replica = new Replica({
        ssn_id: options.ssn_id,
        db_id:  options.db_id,
        db:     db,
        listen: options.listen,
        slave:  this.slave,
        clock:  options.clock,
        callback: options.callback
    });

    // this.rest_api = ...; TODO
}

Server.prototype.close = function () {
    console.warn('Server.close not implemented');
};


module.exports = Server;
