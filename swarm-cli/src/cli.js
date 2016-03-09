#!/usr/bin/env node
"use strict";
var Swarm = require('swarm-client');
require('stream-url-node');
require('stream-url-ws');
var args = require('minimist')(process.argv.slice(2));

/**
 *  HOME
 *  VERBS
 *  ADJECTIVES
 */

if (args.help) {
    var help = [
    '',
    'Command-line Swarm client. Usage: ',
    '    swarm [options] database/home/dir/',
    '',
    'General options',
    '  --debug -D   debug printing on',
    '  --verbose -v verbose',
    '',
    'Actions and their options',
    '--create -C    create an empty database (--create my_db_name)',
    '  --option -O  database options (-O Listen=ws://0.0.0.0:8000)',
    '--run          default, run a replica',
    '  --connect -c server URL to connect to (e.g. ws://localhost:8080)',
    '  --listen -l  URL to listen on (same as above, simply -l for stdin)',
    '  --get -g     retrieve an object, print it and quit',
    '  --sync -y    on upstream connected, sync all|changes (-y all)',
    '  --exec -e    execute script(s), e.g. --exec init.js -e run.js',
    '  --repl -r    REPL interactive mode (e.g. swarm -r < script.js)',
    '  --daemon -z  daemonize (e.g. by rampant propaganda)',
    '  --mute -m    ignore connect/listen options in the db',
    '  --once -1    exit once done (-l will accept 1 connection only)',
    '--access -a    read/write the db directly at key/prefix',
    '  --read -R    default, read data (e.g. -a /Model#3uHRl -R)',
    '  --put -P     write to the db (e.g. -a key -P value)',
    '  --erase -E   erase key/prefix (e.g. -a /Model#3uHRl -R)',
    '  --option -O  rewrite database options (-O Password=test123)',
    '--fork -f      fork the db, create a replica (-f new_dir.db);',
    '  --connect -c the original\'s URL (home dir will work too)',
    '  --client     default, create a client downstream replica',
    '  --ring       create a ring replica',
    '  --slave      create a slave replica',
    '  --shard      separate a shard, one half or some share (e.g. 0.3)',
    '  --rewrite -w rewrite metadata in the existing database (-h mycopy.db -w)',
    '--stats -S     print out db statistics and metadata',
    ''
    ];
    var text = help.map(function (l) {return '    '+l+'\n';}).join('');
    console.log(text);
    process.exit(0);
}

if (args.debug || args.D) {
    Swarm.OpSource.debug = true;
    Swarm.Replica.debug = true;
    Swarm.LevelOpSource.debug = true;
    //Swarm.StreamOpSource.debug = true;
    Swarm.Host.debug = true;
}

if (!args._.length) {
    return done('home dir not specified');
} else if (args._.length>1) {
    return done('multiple home dirs?');
}

// argument normalization
args.home = args._[0] || 'test.db';
args.v = args.verbose || args.v;

if (args.access || args.a) {
    require('./dump')(args, done);
} else if (args.stats || args.S) {
    require('./stats')(args, done);
} else if (args.fork || args.f) {
    require('./fork')(args, done);
} else if (args.create || args.C) {
    require('./create')(args, done);
} else  {
    require('./run')(args, done);
}

function done (err) {
    if (err) {
        if (args.v) {
            console.error(new Error(err).stack);
        } else {
            console.error(err);
        }
    }
    process.exit(err?-1:0);
}

process.on('uncaughtException', function (err) {
  console.error("UNCAUGHT EXCEPTION", err, err.stack);
});
