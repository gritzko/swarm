"use strict";
var fs = require('fs');
var leveldown = require('leveldown');
var Swarm = require('swarm-replica');

module.exports = function run (args, done) {

    process.on('SIGTERM', finalize);
    process.on('SIGINT', finalize);
    process.on('SIGQUIT', finalize);

    var replica;
    var home = args.home;
    if (!fs.existsSync(home)) {
        fs.mkdirSync(home);
    }
    var options = {};
    options.connect = args.connect || args.c;
    options.listen = args.listen || args.l;
    options.db_id = args.db;
    options.onWritable = on_start;
    options.onFail = done;

    var db = leveldown(home);
    db.open(function (err) {
        if (err) {
            done(err);
        } else {
            args.v && console.warn('db open', home);
            replica = new Swarm.Replica(db, options);
        }
    });

    function on_start() {
        args.v && console.warn('replica is writable');
        args.std = args.std || args.s;
        args.get = args.get || args.g;
        args.exec = args.exec || args.e;
        if (args.exec) {
            var scripts = args.exec.constructor === Array ?
                args.exec : [args.exec];
            run_scripts(scripts);
        } else if (args.std) {
            start_stdio(args.std === 'up');
        } else if (args.repl || args.r) {
            start_repl();
        } else if (args.get) {
            get_object();
        }
    }

    function start_stdio() {
        var duplexer = require('duplexer');
        var stdio_stream = duplexer(process.stdout, process.stdin);
        stdio_stream.end = function (op) {
            finalize(op.value);
        };
        Swarm.Replica.HS_WAIT_TIME = 24 * 60 * 60 * 1000; // have your time :)
        if (args.std === 'up') {
            replica.addStreamUp(stdio_stream);
        } else {
            replica.addStreamDown(stdio_stream);
        }
    }

    function run_scripts(scripts) {
        var path = require('path');
        scripts.forEach(function (script) {
            var p = path.resolve('.', script);
            args.v && console.warn('run script', p);
            require(p);
        });
        // TODO this may need to wait for outbound connections, etc
        done();
    }

    function start_repl() {
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

    function get_object() {
        args.v && console.warn('lets get it');
        var Spec = Swarm.Spec;
        var typeid = new Spec(args.get, null, new Spec('/Model'));
        var host = replica.home_host;
        host.get(typeid, function () {
            console.log(this.toString());
            done();
        });
        // FIXME errors, exceptions
    }

    function finalize (error) {
        if (replica) {
            replica.close(function (err) {
                done(error||err);
            });
        } else {
            done(error);
        }
    }

};