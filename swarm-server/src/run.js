"use strict";
const fs = require('fs');
const path = require('path');
const leveldown = require('leveldown');
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const peer = require('swarm-peer');
const Swarm = sync.Swarm;
const async = require('async');
const NodeOpStream = require('./NodeOpStream');

module.exports = function open (home, args, done) {

    const level = leveldown(home);
    let db, sub_db;
    let switch_stream, log_stream, patch_stream;

    const stages = [
        next => db = new peer.LevelOp (level, {createIfMissing: false}, next),
        next => switch_stream = new peer.SwitchOpStream(sub_db, next),
        next => log_stream = new peer.LogOpStream(db, next),
        next => patch_stream = new peer.PatchOpStream(db, next),
        next => {
            patch_stream.pipe(switch_stream);
            log_stream.pipe(patch_stream);
            switch_stream.pipe(log_stream);
            next();
        },
        next => filter(args, log_stream, next),
        next => execute(args, next),
        next => connect(args, next),
        next => listen(args, switch_stream, next),
        next => {
            if (args.d||args.daemon)
                require('daemon')();
            next();
        },
        next => {
            process.on('SIGTERM', close);
            process.on('SIGINT', close);
            process.on('SIGQUIT', close);
        }
    ];

    async.waterfall(stages, done);

};


function close (err) {
    // waterfall too
    // close inputs, ensure all batches go along the chain,
    // close db, close everything

    // in the stdin mode, off triggers close()
}


function execute (args, callback) {
    const exec = args.e || args.exec;
    if (!exec) {
        callback();
    } else if (exec===true) {
        const repl = require('repl');
        repl.start({
            prompt: process.stdout.isTTY ? '\u2276 ' : '',
            useGlobal: true,
            replMode: repl.REPL_MODE_STRICT
        });
    } else if (exec.constructor===String) {
        require(path.resolve('.', exec));
    } else if (exec.constructor===Array) {
        exec.forEach(script => require(path.resolve('.', script)));
    }
}

function listen (args, switch_stream, callback) {
    const listen = args.l || args.listen;
    if (!listen) {
        callback();
    } else if (listen===true) {
        let stdio_stream = new Duplexer(process.stdin, process.stdout);
        let opstream = new NodeOpStream(stdio_stream);
        console.log('listn')
        switch_stream.addClient(opstream, "test"); // FIXME replica id ??!!
    } else if (listen.constructor===String) {

    } else if (listen.constructor===Array) {

    } else {

    }

}

function connect (args, callback) {
    const connect = args.c || args.connect;
    if (!connect) {
        callback();
    } else {
        callback(); // TODO peers
    }
}

function filter (args, log_stream, callback) {
    const filter = args.f || args.filter;
    if (!filter) {
    } else if (filter===true) {
        log_stream.on(op=>console.log(op.toString()));
    } else if (filter.constructor===String) {
        log_stream.on(filter, op=>console.log(op.toString()));
    }
    callback();
}

const Duplex = require('stream').Duplex;
class Duplexer extends Duplex {

    constructor (reader, writer) {
        super();
        this.reader = reader;
        this.writer = writer;
        this.reader.on('data', data=>this.push(data));
        this.reader.on('end', ()=>this.push(null));
    }

    _write(chunk, encoding, callback) {
        this.writer.write(chunk, encoding, callback);
    }

    _read(size) {
    }

}
