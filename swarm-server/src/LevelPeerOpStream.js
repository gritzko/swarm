"use strict";
const url = require('url');
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const peer = require('swarm-peer');
const OpStream = sync.OpStream;
const LevelDOWN = require('leveldown');
const Swarm = sync.Swarm;
const Op = swarm.Op;
const Stamp = swarm.Stamp;

class LevelPeerOpStream extends peer.PeerOpStream {

    constructor (db_url, options, callback) {
        const path = db_url.path;
        const level = new LevelDOWN(path);
        super(level, options, callback);
    }

}

OpStream._URL_HANDLERS['level'] = LevelPeerOpStream;

module.exports = LevelPeerOpStream;
