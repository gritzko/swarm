#!/usr/bin/env node
"use strict";
var Swarm = require('../');
require('stream-url-node');
require('stream-url-ws');
var argv = require('minimist')(process.argv.slice(2));

if (argv.help || argv.h) {
     console.log('\n' +
'    Command-line Swarm client \n' +
'     \n' +
'    Arguments: \n' +
'      --db_id -d   database name \n' +
'      --ssn_id -s  session id \n' +
'      --connect -c server URL to connect to \n' +
'      --listen -l  URL to listen at \n' +
'      --user_id -u user id (ssn_id is assigned by the upstream server)\n' +
'      --db_path -p path to the leveldb database \n' +
'      --repl -r    REPL (interactive mode) \n' +
'      --debug -D   debug printing \n' +
'      --trace -T   trace printing \n'
    );
    process.exit(0);
}


if (argv.debug || argv.D) {
    //Swarm.Replica.debug = true;
    //Swarm.Host.debug = true;
    Swarm.OpSource.debug = true;
}
if (argv.trace || argv.T) {
    Swarm.Replica.trace = true;
}
Swarm.Host.multihost = true;

// TODO multi-db mode
var options = {
    listen: argv.listen || argv.l || 'ws://localhost:8000',
    ssn_id: argv.ssn_id || argv.s || 'swarm~0',
    db_id:  argv.db_id || argv.d || 'test',
    db_path: argv.db_path || argv.p || null,
    callback: report_start
};

var server = Swarm.Server.local = new Swarm.Server(options);

function report_start (err) {
    if (err) {
        console.error(err);
        console.error('server start failed');
        process.exit(-1);
    }
    console.log('swarm database', options.db_id, 'is listening at', options.listen);
    run_scripts();
    if (argv.repl || argv.r) {
        global.Swarm = Swarm;
        global.Server = server;
        var repl = require('repl');
        repl.start({
            prompt: '\u2276 ',
            useGlobal: true,
            replMode: repl.REPL_MODE_STRICT
        });
    }
}


function run_scripts () {
    var path = require('path');
    var scripts = argv._ || [];
    scripts.forEach(function(script){
        var p = path.resolve('.', script);
        require(p);
    });
}


process.on('uncaughtException', function (err) {
  console.error("UNCAUGHT EXCEPTION", err, err.stack);
});
