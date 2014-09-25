"use strict";

// 3rd parties
var nopt = require('nopt');
var cluster = require('cluster');

// Swarm + Model
var Swarm = require('../lib/NodeServer');
var Mouse = require('../example/mice/model/Mouse');
require('../example/mice/model/Mice');
// add "ws:"-protocol realization for Pipe
require('../lib/EinarosWSStream');

// parse cmd-line options
var options = nopt({
        host: String, // host to connect
        count: Number, // mice count
        freq: Number, // frequency of movements (ms)
        debug: Boolean
    });
var connect_to = (options.host || 'localhost:8000');
var mice_count = (options.count || 10);
var freq = (options.freq || 30);
var debug_on = options.debug;

var user = process.env.user || 'master';

console.log(user + ' start');

process.on('SIGTERM', onExit);
process.on('SIGINT', onExit);
process.on('SIGQUIT', onExit);

function onExit(exitCode) {
    console.log(user + ' exit ', exitCode);
    for (var worker_id in cluster.workers) {
        cluster.workers[worker_id].kill();
    }
    process.exit(exitCode);
}

if (cluster.isMaster) {
    for (var i = 0; i < mice_count; i++) {
        cluster.fork({ user: 's' + (i + 1) });
    }
} else {
    Swarm.env.debug = debug_on;

    var my_host = Swarm.localhost = new Swarm.Host(user + '~0');
    var mickey = new Mouse(user);

    // open #mice, list our object
    var mice = my_host.get('/Mice#mice', function () {
        mice.addObject(mickey);
    });

    mickey.on('.init', function () {
        if (this._version === '!0') {
            mickey.set({
                x: 100 + (0 | (Math.random() * 100)),
                y: 100 + (0 | (Math.random() * 100)),
                symbol: user
            });
        }
        setInterval(function moveMouse() {
            mickey.set({
                x: Math.min(300, Math.max(0, mickey.x + (0 | (Math.random() * 3)) - 1)),
                y: Math.min(300, Math.max(0, mickey.y + (0 | (Math.random() * 3)) - 1))
            });
        }, freq);
    });

    // connect to server
    my_host.connect('ws://' + connect_to, {delay: 50});
}
