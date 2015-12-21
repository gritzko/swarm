"use strict";
var Swarm = require('../');
require('stream-url-node');
require('stream-url-ws');
var argv = require('yargs')
    .usage('swarm-server --listen url --db db_name [--repl]')
    .alias('l', 'listen')
    .default('listen', 'ws://localhost:8000')
    .alias('d', 'db')
    .default('db', 'test_db')
    .alias('D', 'debug')
    .alias('T', 'trace')
    .alias('p', 'db_path')
    .default('db_path', 'swarm.db')
    .argv;

if (argv.debug) {
    Swarm.Replica.debug = true;
    Swarm.Host.debug = true;
}
if (argv.trace) {
    Swarm.Replica.trace = true;
}

var server = new Swarm.Server({
        listen: argv.listen,
        ssn_id: 'swarm~0',
        db_id:  argv.db,
        db_path: argv.db_path,
        callback: report_start
    });

function report_start (err) {
    if (err) {
        console.error(err);
        console.error('server start failed');
        process.exit(-1);
    }
    console.log('swarm database', argv.db, 'is listening at', argv.listen);
    if (argv.repl) {
        global.Swarm = Swarm;
        global.Server = server;
        var repl = require('repl')
        repl.start({
            prompt: '\u2276 ',
            useGlobal: true,
            replMode: repl.REPL_MODE_STRICT
        });
    }
}
