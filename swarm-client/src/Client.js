"use strict";
var Swarm = require('swarm-replica');
var Replica = Swarm.Replica;
var Host = Swarm.Host;
//var EventEmitter = require('eventemitter3');
var util = require('util');

// TODO import ws stream wrapper in a browser

// Swarm (caching) client
function Client (options) {
//    EventEmitter.call(this);
    this.options = options;
    if (!options.db_id) {
        throw new Error('db id is required');
    }
    if (!options.ssn_id && !options.user_id) {
        throw new Error('user or session id is required');
    }
    if (!options.connect) {
        //throw new Error('need a server url');
        console.warn("no server URL specified");
    }

    this.replica = new Replica({
        ssn_id:  options.ssn_id,
        user_id: options.user_id,
        db_id:   options.db_id,
        connect: options.connect,
        db:      options.db,
        callback: connect_em
    });

    this.host = new Host({
        ssn_id: options.ssn_id,
        user_id:options.user_id,
        db_id:  options.db_id,
        clock:  options.clock,
        onwritable: options.onwritable
    });

    var self = this;
    function connect_em () {
        self.replica.addOpStreamDown(self.host);
    }

}
//util.inherits(Client, EventEmitter);

Swarm.Client = Client;
module.exports = Swarm;


Client.prototype.get = function (id) {
    return this.host.get(id);
};


Client.prototype.close = function (cb) {
    this.host.close();
    this.replica.close(cb);
};
