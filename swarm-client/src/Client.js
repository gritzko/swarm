"use strict";
var Swarm = require('swarm-replica');
var Replica = Swarm.Replica;
var Host = Swarm.Host;
//var EventEmitter = require('eventemitter3');
// var util = require('util');

// TODO import ws stream wrapper in a browser

// Swarm (caching) client
function Client (options) {
//    EventEmitter.call(this);
    var self = this;
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
    // relay all the relevant options
    this.replica = new Replica({
        ssn_id:  options.ssn_id,
        user_id: options.user_id,
        db_id:   options.db_id,
        connect: options.connect,
        db:      options.db,
        empty_db : options.empty_db,
        callback: connect_em
    });

    this.host = new Host({
        ssn_id: options.ssn_id,
        user_id:options.user_id,
        db_id:  options.db_id,
        clock:  options.clock,
        onwritable: options.onwritable
    });

    function connect_em () {
        self.replica.addOpStreamDown(self.host);
        self.host.emitHandshake();
        options.callback && options.callback();
    }

}
//util.inherits(Client, EventEmitter);  TODO
module.exports = Client;


Client.prototype.get = function (id) {
    return this.host.get(id);
};


Client.prototype.close = function (cb) {
    this.host.close();
    this.replica.close(cb);
};
