"use strict";
var SwarmServer = require('../');
require('stream-url-node');
require('stream-url-ws');
var argv = require('yargs')
    .usage('swarm-server --listen url --db db_name [--repl]')
    .alias('l', 'listen')
    .default('listen', 'ws://localhost:8000')
    .alias('d', 'db')
    .default('db', 'test_db')
    .alias('D', 'debug')
    .argv;

var server = new SwarmServer({
        listen: argv.listen,
        ssn_id: 'swarm~0',
        db_id:  argv.db,
        callback: report_start
    });

function report_start (err) {
    if (err) {
        console.error(err);
        console.error('server start failed');
        process.exit(-1);
    }
    console.log('swarm database', argv.db, 'is listening at', argv.listen);
    require('repl').start('> ');
}
