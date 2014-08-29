"use strict";

var Swarm = module.exports = {};

Swarm.env = require('./env');
Swarm.Spec = require('./Spec');
Swarm.Syncable = require('./Syncable');
Swarm.Model = require('./Model');
Swarm.Set = require('./Set');
Swarm.Host = require('./Host');
Swarm.Pipe = require('./Pipe');
Swarm.Storage = require('./Storage');
Swarm.SharedWebStorage = require('./SharedWebStorage');
Swarm.WebSocketStream = require('./WebSocketStream');

Swarm.get = function (spec) { return Swarm.env.localhost.get(spec); }
