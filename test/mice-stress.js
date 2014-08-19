// FIXME UPDATE

var Swarm = require('../lib/swarm3.js'),
    swarm_server = require('../lib/swarm3-server.js'),
    model = require('../example/mice/model/mouse_model'),
    nopt = require('nopt'),
    cluster = require('cluster'),
    options = nopt({
        host: String, // host to connect
        count: Number, // mice count
        freq: Number // frequency of movements (ms)
    }),
    connect_to = (options.host || 'localhost:8000'),
    mice_count = (options.count || 10),
    freq = (options.freq || 30),
    user = process.env.user || 'master';

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
    //Swarm.debug = true;

    var my_host = Swarm.localhost = new Swarm.Host(user + '~0'),

        mickey = new model.Mouse(user),

        // open #mice, list our object
        mice = my_host.get('/Mice#mice', function () {
            mice.addObject(mickey);
        });

    function moveMouse() {
        mickey.set({
            x: Math.min(300, Math.max(0, mickey.x + (0 | (Math.random() * 3)) - 1)),
            y: Math.min(300, Math.max(0, mickey.y + (0 | (Math.random() * 3)) - 1))
        });
    }

    mickey.on('.init', function () {
        if (this._version !== '!0') return; // FIXME default values

        mickey.set({
            x: 100 + (0 | (Math.random() * 100)),
            y: 100 + (0 | (Math.random() * 100)),
            symbol: user
        });

        setInterval(moveMouse, freq);
    });

    // connect to server
    my_host.connect('ws://' + connect_to, {delay: 50});
}
