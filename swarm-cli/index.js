"use strict";
var fs = require('fs');
var level = require('level');
var Swarm = require('../');
require('stream-url-node');
require('stream-url-ws');
var argv = require('minimist')(process.argv.slice(2));


var options = {};

if (argv.debug || argv.D) {
    Swarm.Replica.debug = true;
    Swarm.Host.debug = true;
}

options.connect = argv.connect || argv.c;
options.user_id = argv.user_id || argv.u;
options.ssn_id = argv.ssn_id || argv.s;
options.db_id = argv.db_id || argv.d;

var db_path = argv.db_path || argv.p ||
    (options.ssn_id ? options.ssn_id+'.db' : 'swarm_client.db');
if (!fs.existsSync(db_path)) {
    fs.mkdirSync(db_path);
}
options.db = level(db_path);

var client = new Swarm.Client(options);

process.on('SIGTERM', onExit);
process.on('SIGINT', onExit);
process.on('SIGQUIT', onExit);

function onExit (code) {
    client.close(function (){
        process.exit(code);
    });
}

if (argv._) {
    // TODO run scripts
}

if (argv.repl) {
    console.log('REPL');
    var repl = require('repl');
    global.Swarm = Swarm;
    global.Client = client;
    repl.start({
        prompt: '\u2276 ',
        useGlobal: true,
        replMode: repl.REPL_MODE_STRICT
    })
}
