#!/usr/bin/env node
"use strict";
var fs = require('fs');
var level = require('level');
var Swarm = require('swarm-client');
require('stream-url-node');
require('stream-url-ws');
var argv = require('minimist')(process.argv.slice(2));

/**
 */

if (argv.help || argv.h) {
     console.log('\n' +
'    Command-line Swarm client \n' +
'     \n' +
'    Arguments: \n' +
'      --db_id -d   database name \n' +
'      --ssn_id -s  session id \n' +
'      --connect -c server URL to connect to \n' +
'      --user_id -u user id (ssn_id is assigned by the server)\n' +
'      --db_path -p path to the leveldb database \n' +
'      --repl -r    REPL (interactive mode) \n' +
'      --debug -D   debug printing \n'
    );
    process.exit(0);
}

var options = {};

if (argv.debug || argv.D) {
    // Swarm.Replica.debug = true;
    // Swarm.Host.debug = true;
    Swarm.OpSource.debug = true;
}

options.connect = argv.connect || argv.c;
options.user_id = argv.user_id || argv.u;
options.ssn_id = argv.ssn_id || argv.s;
options.db_id = argv.db_id || argv.d;

var db_path = argv.db_path || argv.p ||
    (options.ssn_id ? options.db_id+'-'+options.ssn_id+'.db' : 'swarm_client.db');
if (!fs.existsSync(db_path)) {
    fs.mkdirSync(db_path);
}
options.db = level(db_path);
options.callback = run_scripts;

var client = new Swarm.Client(options);

process.on('SIGTERM', onExit);
process.on('SIGINT', onExit);
process.on('SIGQUIT', onExit);

function onExit (code) {
    client.close(function (){
        process.exit(code);
    });
}


function run_scripts () {
    var path = require('path');
    var scripts = argv._ || [];
    scripts.forEach(function(script){
        var p = path.resolve('.', script);
        require(p);
    });
}


if (argv.repl || argv.r) {
    console.log('REPL');
    var repl = require('repl');
    global.Swarm = Swarm;
    global.Client = client;
    repl.start({
        prompt: '\u2276 ',
        useGlobal: true,
        replMode: repl.REPL_MODE_STRICT
    });
}


process.on('uncaughtException', function (err) {
  console.error("UNCAUGHT EXCEPTION", err, err.stack);
});
