"use strict";
var fs = require('fs');
var Swarm = require('swarm-replica');
var Replica = Swarm.Replica;
var Host = Swarm.Host;
var level = require('level');
require('stream-url-ws');

// The class is just a convenience wrapper that starts a server-side Replica+
// Host combo where the Host is mostly used for op log aggregation.
// TODO add REST API for state bundles (Replica->Host->REST API)
function Server (options) {
    options.debug && console.log('swarm server options', options);
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

    if (options.db) {
        this.db = options.db;
    } else {
        var db_path = options.db_path || './swarm.db';
        if (!fs.existsSync(db_path)) {
            fs.mkdirSync(db_path);
        }
        this.db = level(db_path);
    }

    // BIG TODO: propagate ssn grant replica->host
    // use exactly the same clock object!!!

    this.snapshot_slave = new Host({ // Host constructor is synchronous
        ssn_id: options.ssn_id,
        db_id:  options.db_id,
        clock:  options.clock,
        api:    false,
        snapshot: 'immediate'
    });

    this.replica = new Replica({
        ssn_id: options.ssn_id,
        db_id:  options.db_id,
        db:     this.db,
        listen: options.listen,
        snapshot_slave:  this.snapshot_slave,
        clock:  options.clock,
        callback: options.callback
    });

    this.snapshot_slave.go(); //?
    // this.rest_api = ...; TODO
}

Server.prototype.close = function (callback) {
    this.options && this.options.debug && console.warn('Server.close');
    var self = this;
    self.replica.close(function(){
        self.snapshot_slave.close();
        self.db.close(function(){
            if (callback)
                callback();
            else
                process.exit(0);
        });
    });
};

Swarm.Server = Server;
module.exports = Swarm;
