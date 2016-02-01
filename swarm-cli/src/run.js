"use strict";
var fs = require('fs');
var leveldown = require('leveldown');
var Swarm = require('swarm-replica');

var client, args;

process.on('uncaughtException', function (err) {
  console.error("UNCAUGHT EXCEPTION", err, err.stack);
});
process.on('SIGTERM', onExit);
process.on('SIGINT', onExit);
process.on('SIGQUIT', onExit);

function onExit (code) {
    if (!client) { return; }
    client.close(function (){
        process.exit(code);
    });
    client = null;
}

function run (argv, done) {
    args = argv;
    var home = args.home;
    if (!fs.existsSync(home)) {
        fs.mkdirSync(home);
    }
    var options = {};
    options.connect = argv.connect || argv.c;
    options.listen = argv.listen || argv.l;
    options.db_id = argv.db;
    options.onReady = on_start;
    options.onFail = done;

    var db = leveldown(home);
    db.open(function(err){
        if (err) {
            done(err);
        } else {
            argv.v && console.warn('db open', home);
            client = new Swarm.Replica(db, options);
        }
    })
}
module.exports = run;

function on_start (db_hs) {
    args.v && console.warn('db is ready', db_hs.toString());
    var std = args.std || args.s;
    if (std) {
        start_stdio(std==='up');
    }
    var e = args.exec;
    if (e) {
        var scripts = e.constructor===Array ? e : [e];
        run_scripts(scripts);
    }
    if (args.repl || args.r) {
        start_repl();
    }
}

function start_stdio (upstream) {
    var duplexer = require('duplexer');
    var stdio_stream = duplexer(process.stdout, process.stdin);
    Swarm.Replica.HS_WAIT_TIME = 24*60*60*1000; // 24h :)
    if (stdup) {
        client.replica.addStreamUp(stdio_stream);
    } else {
        client.replica.addStreamDown(stdio_stream);
    }
}


function run_scripts (scripts) {
    var path = require('path');
    scripts.forEach(function(script){
        var p = path.resolve('.', script);
        require(p);
    });
}

function start_repl () {
    args.v && console.warn('launching REPL');
    var repl = require('repl');
    global.Swarm = Swarm;
    global.Client = client;
    repl.start({
        prompt: process.stdout.isTTY ? '\u2276 ' : '',
        useGlobal: true,
        replMode: repl.REPL_MODE_STRICT
    });
}
