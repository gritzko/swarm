var Swarm = require('swarm-client');
var level = require('level-js');
require('stream-url-ws');

window.Swarm = Swarm;
Swarm.DB = level;

module.exports = Swarm;
