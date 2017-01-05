"use strict";
const protocol = require('swarm-protocol');

// leveldb for the store, that's it
// JSON files come in a separate layer


class LevelNodeStore extends protocol.Client.Store {

    constructor (db) {
        this.db = db;
    }

    get (keys, callback) {
        this.db.get();
    }

    set (keys_values, callback) {
        this.db.batch();
    }

}

module.exports = LevelNodeStore;