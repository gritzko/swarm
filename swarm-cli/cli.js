#!/usr/bin/env node
"use strict";
const fs = require('fs');
const async = require('async');
const swarm = require('swarm-protocol');
const cli = require('commander');
const Stamp = swarm.Stamp;
const Spec = swarm.Spec;

const idre = new RegExp('^[/#]?(T)(?:[#/\\](T))?'.replace(/T/g, Stamp.rsTokExt));

function parseId (arg, list) { // TODO stdin / file read!!!
    list = list || [];
    const m = idre.exec(arg); // TODO id list, comma/space separated
    if (m===null) {
        console.warn('invalid object id', arg);
    } else {
        const spec = new Spec(m[2] ? [m[1], m[2]] : ['LWWObject', m[1]] );
        list.push(spec);
    }
    return list;
}

cli
    .version('0.0.1')
    .arguments('[path]')
    .option("-C --connect <url>", 'connect to a server, init a replica')
    .option("-u --update [object]", "update an object (e.g. -u 1GLCR5+Rgritzko1)", parseId)
    .option("-c --create [type]", "create an object (e.g. -c LWWObject)", "LWWObject")
    .option("-g --get <object>", "retrieve the current version of the object", parseId)
    .option("-c --cat <object>", "print out the object's JSON", parseId)
    .option("-r --recur <depth>", "recursive retrieval", parseInt)
    .option("-p --put <object>", "commit a manually edited JSON object", parseId)
    .option("-e --edit <object>", "edit a JSON state, put when done (uses $EDITOR)", parseId)
    .option("-o --op <object>", "feed an op", parseId)
    .option("    -n --name <name>", "op name to feed")
    .option("    -v --value <value>", "op value to feed")
    .option("-E --exec <file>", "execute a script (e.g. --exec init.js -E run.js)")
    .option("-R --repl", "run REPL")
    .option("-L --log", "list the log of yet-unacked local ops")
    .option("-m --mute", "don't talk to the server")
    .option("-n --now", "issue a timestamp")
    .option("-v --verbose", "verbosity level")
    .parse(process.argv)
;


let client, cache, upstream;

const stages = [
    do_connect,
    do_update,
    do_create,
    do_get,
    do_cat,
    do_put,
    do_edit,
    do_op,
    do_sync
];


async.waterfall( stages, done );


function json_file_name (spec) {
    cache.filePath(spec);
}

function do_connect (next) {
    cli.connect;
    client = new Client();
    cache = new node.FilesystemCache(client);
    upstream = new node.StdioOpStream(); // TODO upstream.retry(), backoff
}

function do_update (next) {
    const list = cli.update;
    if (!list || !list.length) return next();
    let inc = list.length, dec = 0;
    while (list.length)
        client.get(list.pop(), () => ++dec===inc && next() );
}

function do_create (next) {
    const list = cli.create;
    if (!list || !list.length) return next();
    try {
        list.forEach( type => client.create(type) );
        next();
    } catch (ex) {
        next(ex.message);
    }
}

function do_get (next) {
    const list = cli.get;
    if (!list || !list.length) return next();
    let inc = list.length, dec = 0;
    while (list.length) {
        client.get(list.pop(), (obj) => {
            console.log(obj.object);
            ++dec === inc && next();
        });
    }
}

function do_cat (next) {
    const list = cli.cat;
    if (!list || !list.length) return next();
    list.forEach( id => client.get(id,
        obj => console.log(obj.object, obj.toJSON(4))
    ) );
    next();
}

function do_put (next) { // GOOOOD
    const list = cli.put;
    if (!list || !list.length) return next();
    const files = list.map(json_file_name);
    if (!files.every(fs.existsSync))
        return next('file not found');
    const jsons = files.map( fs.readFileSync );
    const parseds = jsons.map( JSON.parse );
    list.map( (spec, i) => client.get(spec, obj => obj.save(parseds[i])) );
    next();
}

function do_edit (next) {
    const list = cli.edit;
    if (!list || !list.length) return next();
    const child = require('child_process');
    const editor = process.env.EDITOR;
    if (!editor) return next('$EDITOR not defined');

    cli.get = list;
    do_get ( err => client.onSync(edit_all) );

    function edit_all() {
        const files = list.map(json_file_name);
        files.forEach( file => child.execFileSync(editor, file) );
        cli.put = list;
        do_put(next);
    }

}

function do_op (next) {
    const list = cli.edit;
    if (!list || !list.length) return next();
    const id = list.shift();
    const name = cli.name;
    const value = cli.value;
    if (!name || !value) {
        next('need a name/value pair');
    } else {
        client.submit(id, cli.name, cli.value);
        next();
    }
}

function do_sync (next) {
    if (cli.mute) {
        next();
    } else {
        client.onSync(next);
    }
}

function done (err) {
    if (err) {
        if (cli.verbose) {
            console.error(new Error(err).stack);
        } else {
            console.error(err);
        }
    }
    process.exit(err?-1:0);
}

// be ready
process.on('uncaughtException', function (err) {
    console.error("UNCAUGHT EXCEPTION", err, err.stack);
});
