'use strict';
var Swarm = require('swarm-client');
var level = require('level-js');
var levelup = require('levelup');
require('stream-url-ws');

window.Swarm = Swarm;
Swarm.Replica.createDatabase = function (name) {
    return levelup(name, { db: level });
};

module.exports = Swarm;
