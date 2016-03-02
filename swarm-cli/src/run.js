"use strict";
var fs = require('fs');
var leveldown = require('leveldown');
var Swarm = require('swarm-replica');

var replica, args, done_cb;

process.on('SIGTERM', onExit);
process.on('SIGINT', onExit);
process.on('SIGQUIT', onExit);

function onExit (code) {
    if (!replica) { return; }
    replica.close(function (){
        process.exit(code);
    });
    replica = null;
}

function run (argv, done) {
    args = argv;
    done_cb = done;
    var home = args.home;
    if (!fs.existsSync(home)) {
        fs.mkdirSync(home);
    }
    var options = {};
    options.connect = argv.connect || argv.c;
    options.listen = argv.listen || argv.l;
    options.db_id = argv.db;
    options.onWritable = on_start;
    options.onFail = done;

    var db = leveldown(home);
    db.open(function(err){
        if (err) {
            done(err);
        } else {
            argv.v && console.warn('db open', home);
            replica = new Swarm.Replica(db, options);
        }
    });
}
module.exports = run;

function on_start () {
    args.v && console.warn('replica is writable');
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
    args.get = args.get || args.g;
    if (args.get) {
        get_object();
    }
}

function start_stdio (upstream) {
    var duplexer = require('duplexer');
    var stdio_stream = duplexer(process.stdout, process.stdin);
    stdio_stream.end = function (op) {
        process.stdout.write(op.toString()+'\n');
        replica.close(function(err){
            process.exit(err?1:0);
        });
    }
    Swarm.Replica.HS_WAIT_TIME = 24*60*60*1000; // have your time :)
    if (args.std==='up') {
        replica.addStreamUp(stdio_stream);
    } else {
        replica.addStreamDown(stdio_stream);
    }
}


function run_scripts (scripts) {
    var path = require('path');
    scripts.forEach(function(script){
        var p = path.resolve('.', script);
        args.v && console.warn('run script', p);
        require(p);
    });
}

function start_repl () {
    args.v && console.warn('launching REPL');
    var repl = require('repl');
    global.Swarm = Swarm;
    global.Client = replica;
    repl.start({
        prompt: process.stdout.isTTY ? '\u2276 ' : '',
        useGlobal: true,
        replMode: repl.REPL_MODE_STRICT
    });
}


function get_object () {
    args.v && console.warn('lets get it');
    var Spec = Swarm.Spec;
    var typeid = new Spec(args.get, null, new Spec('/Model'));
    var host = replica.home_host;
    host.get(typeid, function () {
        console.log(this.toString());
        done_cb();
    });
    // FIXME errors, exceptions  -- -done()
}