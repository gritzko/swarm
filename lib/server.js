'use strict';

var Swarm           = require('./index');
var EinarosWSStream = require('./EinarosWSStream');

Swarm.registerProtocolHandler('ws', EinarosWSStream);
Swarm.registerProtocolHandler('wss', EinarosWSStream);

module.exports = Swarm;
