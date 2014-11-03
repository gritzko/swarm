"use strict";

var Swarm = module.exports = window.Swarm = {};

Swarm.env = require('./env');
Swarm.Spec = require('./Spec');
Swarm.LongSpec = require('./LongSpec');
Swarm.Syncable = require('./Syncable');
Swarm.Model = require('./Model');
Swarm.Set = require('./Set');
Swarm.Vector = require('./Vector');
Swarm.Host = require('./Host');
Swarm.Pipe = require('./Pipe');
Swarm.Storage = require('./Storage');
Swarm.SharedWebStorage = require('./SharedWebStorage');
Swarm.LevelStorage = require('./LevelStorage');
Swarm.WebSocketStream = require('./WebSocketStream');
Swarm.ReactMixin = require('./ReactMixin');

Swarm.get = function (spec) {
    return Swarm.env.localhost.get(spec);
};

var env = Swarm.env;

if (env.isWebKit || env.isGecko) {
    env.log = function css_log(object, spec, value, src) {
        var host = env.multihost && object && object._host ? '@' + object._host._id : '';
        var obj = object && object.toString() || '';
        var source = src && src.toString() || '';

        if (value && value.constructor.name === 'Spec') {
            value = value.toString();
        }

        console.log(
                "%c%s %c%s  %c%s  %c%O  %c%s",
                "color: #ccd",
                host,
                "color: #888",
                obj,
                "color: #024; font-style: italic",
                spec.toString(),
                "font-style: normal; color: #042",
                value,
                "color: #88a",
                source
        );
    };
}
