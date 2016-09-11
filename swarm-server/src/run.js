"use strict";
const fs = require('fs');
const path = require('path');
const leveldown = require('leveldown');
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const peer = require('swarm-peer');
const async = require('async');
const NodeOpStream = require('./NodeOpStream');
const AuthOpStream = require('./AuthOpStream');

module.exports = function open (home, args, done) {

    if (!fs.existsSync(home))
        return done('no such dir');
    if (!fs.statSync(home).isDirectory())
        return done('not a dir');

    let sub_home = path.join(home, '.subs');
    const level = leveldown(home);
    const sub_level = leveldown(sub_home);
    let basename = path.basename(home);

    let db, sub_db;
    let switch_stream, log_stream, patch_stream, auth_stream;

    const stages = [
        next => db = new peer.SwarmDB (new swarm.Stamp(basename), level, {createIfMissing: false}, next),
        next => sub_db = new peer.LevelOp (sub_level, {createIfMissing: true}, next),
        next => switch_stream = new peer.SwitchOpStream(sub_db, next),
        next => log_stream = new peer.LogOpStream(db, next),
        next => patch_stream = new peer.PatchOpStream(db, next),
        next => {
            patch_stream.pipe(switch_stream);
            log_stream.pipe(patch_stream);
            switch_stream.pipe(log_stream);
            let trace = args.T || args.trace;
            if (trace===true) trace = 'PLS';
            if (trace) {
                args.trace = trace;
                patch_stream._debug = trace.indexOf('P')===-1 ? null : 'P';
                log_stream._debug = trace.indexOf('L')===-1 ? null : 'L';
                switch_stream._debug = trace.indexOf('S')===-1 ? null : 'S';
            }
            next();
        },
        next => auth_stream = new AuthOpStream(db, switch_stream, next),
        next => load_auth(args, auth_stream, next),
        next => filter(args, log_stream, next),
        next => execute(args, next),
        next => connect(args, next),
        next => listen(args, auth_stream, next),
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

function listen (args, auth_stream, done) {
    const listen = args.l || args.listen;
    if (!listen) {
        done();
    } else if (listen===true || listen==='-') {
        listen_stdio(args, auth_stream, done);
    } else if (listen.constructor===String) {

    } else if (listen.constructor===Array) {

    } else {

    }

}

function listen_stdio (args, auth_stream, done) {
    let stdio_stream = new Duplexer(process.stdin, process.stdout);
    let opstream = new NodeOpStream(stdio_stream);
    if (args.trace && args.trace.indexOf('I')!==-1)
        opstream._debug = 'I';
    auth_stream.addClient(opstream, "test"); // FIXME replica id ??!!
}

function listen_tcp (args, auth_stream, done) {

}

function listen_ws (args, auth_stream, done) {

}

function load_auth (args, auth_stream, done) {
    const req = args.a || args.auth;
    let auth_ext;
    if (!req) {
        done();
    } else if (req.constructor!==String) {
        done('auth extension must be an OpStream');
    } else {
        let fn = require(req);
        auth_ext = new fn(args, done);
        auth_ext.connect(auth_stream);
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

    end () {
        setTimeout(process.exit.bind(process), 100); // FIXME proper close
    }

}
