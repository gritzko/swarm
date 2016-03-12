"use strict";
var fs = require('fs');
var leveldown = require('leveldown');
var Swarm = require('swarm-replica');
var Replica = Swarm.Replica;


module.exports = function run (args, done) {

    args.connect = args.connect || args.c;
    if (args.connect===true) { args.connect='std:'; }
    args.listen = args.listen || args.l;
    if (args.listen===true) { args.listen='std:'; }
    args.get = args.get || args.g;
    args.sync = args.sync || args.y;
    args.exec = args.exec || args.e;
    args.repl = args.repl || args.r;
    args.daemon = args.daemon || args.z;
    args.mute = args.mute || args.m;
    args.once = args.once || args['1'];

    process.on('SIGTERM', quit);
    process.on('SIGINT', quit);
    process.on('SIGQUIT', quit);

    var replica;
    var home = args.home;
    if (!fs.existsSync(home)) {
        fs.mkdirSync(home);
    }
    var options = {};
    //options.connect = args.connect || null;
    //options.listen = args.listen || null;
    options.onWritable = execute;
    options.onFail = done;
    options.home_host = true;

    var db = leveldown(home);
    db.open(function (err) {
        if (err) {
            done(err);
        } else {
            args.v && console.warn('db open', home);
            replica = new Replica(db, options);
        }
    });

    function execute() {
        args.v && console.warn('* replica is writable');
        var action_queue = [];
        if (args.connect) {
            action_queue.push(connect);
        }
        if (args.listen) {
            action_queue.push(listen);
        }
        if (args.get) {
            action_queue.push(get);
        }
        if (args.sync) {
            action_queue.push(sync);
        }
        if (args.exec) {
            action_queue.push(exec);
        }
        if (args.repl) {
            action_queue.push(repl);
        } else if (args.daemon) {
            action_queue.push(daemon);
        }
        if (args.once) {
            action_queue.push(once);
        }
        next_action();
        function next_action (error) {
            if (error) {
                return quit(error);
            } else if (action_queue.length) {
                var action = action_queue.shift();
                action(next_action);
            }
        }
    }

    function connect (cb) {
        args.v && console.warn('* connect', args.connect);
        if (args.connect!='std:') {
            replica.connect(args.connect, {}, cb);
        } else { // FIXME std:
            var duplexer = require('duplexer');
            var stdio_stream = duplexer(process.stdout, process.stdin);
            stdio_stream.close = function () {};
            stdio_stream.end = function (a,b,c) {
                if (a) this.write(a,b,c);
            };
            Swarm.Replica.HS_WAIT_TIME = 24 * 60 * 60 * 1000; // have your time :)
            replica.on('connection', function(ev){
                if (ev.upstream) {
                    cb();
                }
            });
            replica.addStreamUp(null, stdio_stream);
        }
    }

    function listen (cb) {
        args.v && console.warn('* listen', args.listen);
        if (args.listen!='std:') {
            replica.listen(args.listen, {once: args.once}, cb);
        } else {
            var duplexer = require('duplexer');
            var stdio_stream = duplexer(process.stdout, process.stdin);
            stdio_stream.close = function () {
            };
            stdio_stream.end = function (a,b,c) {
                if (a) this.write(a,b,c);
            };
            replica.on('disconnect', function (){
                delete replica.servers[args.listen]; // once
            });
            Swarm.Replica.HS_WAIT_TIME = 24 * 60 * 60 * 1000; // have your time :)
            replica.servers[args.listen] = {close:function(){}};
            replica.addStreamDown(stdio_stream);
            cb();
        }
    }

    function get(cb) {
        args.v && console.warn('* get', args.get);
        var Spec = Swarm.Spec;
        var typeid = new Spec(args.get, null, new Spec('/Model'));
        var host = replica.home_host;
        host.get(typeid, function () {
            console.log(this.toString());
        });
        cb(); // at this point, typeid gets into replica.unsynced
    }

    function sync (cb) {
        args.v && console.warn('* sync', args.sync);
        replica.sync (args.sync==='all'?'all':'changed', cb);
    }

    function exec(cb) {
        var scripts = args.exec.constructor === Array ?
            args.exec : [args.exec];
        var path = require('path');
        scripts.forEach(function (script) {
            var p = path.resolve('.', script);
            args.v && console.warn('* run script', p);
            require(p);
        });
        cb();
    }

    function repl(cb) {
        args.v && console.warn('* launching REPL');
        var repl = require('repl');
        global.Swarm = Swarm;
        global.Client = replica;
        repl.start({
            prompt: process.stdout.isTTY ? '\u2276 ' : '',
            useGlobal: true,
            replMode: repl.REPL_MODE_STRICT
        });
    }

    function daemon (cb) {
        args.v && console.warn('* daemonize');
        require('daemon')();
        cb();
    }

    function once (cb) {
        args.v && console.warn('* once');
        replica.on('disconnect', function () {
            args.v && console.warn('* disconnection');
            var source_count = Object.keys(replica.streams).length;
            if (replica.home_host) source_count--;
            var pending_count = replica.pre_streams.length;
            var server_count = Object.keys(replica.servers).length;
            if (!source_count && !pending_count && !server_count) {
                quit();
            } else {
                args.v && console.warn('* waiting', source_count, pending_count, server_count);
            }
        });
        if (replica.unsynced_count) {
            replica.on('synced', function () {
                args.v && console.warn('* synced');
                replica.disconnect();
            });
        } else {
            console.error('* synced already');
            var server_count = Object.keys(replica.servers).length;
            if (!server_count) {
                replica.disconnect();
            }
        }
    }

    function quit (error) {
        args.v && console.warn('* quit', error);
        if (replica) {
            replica.close(function (err) {
                done(error||err);
            });
        } else {
            done(error);
        }
    }

};