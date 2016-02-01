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

if (args.help || args.h) {
    var help = [
    '',
    'Command-line Swarm client ',
    '',
    'Database options',
    '--home -h      the home directory for the database',
    '  --Dxxx       database options (e.g. --Daccess=UserPassword)',
//    '  --repl_id    replica id (override)',
    '  --debug -D   debug printing on',
    '  -v           verbose',
    '',
    'Actions and their options',
    '--create -C    create a database (--create my_db_name)',
    '--run          default, may take scripts (e.g. --run script.js)',
    '  --connect -c server URL to connect to (e.g. ws://localhost:8080)',
    '  --listen -l  URL to listen on (e.g. ws://localhost:8080)',
//    '  --setc -C    server URL, remember and make the default',
//    '  --setl -L    URL to listen, remember and make the default',
    '  --repl -r    REPL interactive mode (e.g. swarm -r < script.js)',
    '  --std -s     read stdin/out as a connection (upstream: --std up)',
    '  --daemon -z  daemonize (e.g. by rampant propaganda)',
    '  --quit -1    sync all data and quit',
    '--access -a    read/write the db directly at key/prefix',
    '  --read -R    default, read data (e.g. -a /Model#3uHRl -R)',
    '  --put -P     write to the db (e.g. -a key -P value)',
    '  --erase -E   erase key/prefix (e.g. -a /Model#3uHRl -R)',
    '--fork -f      fork the db, create a replica (-f new_dir.db)',
    '  --downstream default, create a downstream replica',
    '  --ring -o    create a ring replica',
    '  --slave -1   create a slave replica',
    '  --shard -2   separate a shard, one half or some share (e.g. 0.3)',
    '  --rewrite -w rewrite metadata in the existing database (-h mycopy.db -w)',
    '  --connect -c make a handshake to the upstream at the URL (no -h then)',
    '--stats -S     print out db statistics and metadata',
    ''
    ];
    var text = help.map(function (l) {return '    '+l+'\n';}).join('');
    console.log(text);
    process.exit(0);
}

if (args.debug || args.D) {
    Swarm.OpSource.debug = true;
}

args.home = args.home || args.h;
args.db = args.db || args.d;
if (!args.home) {
    if (!args.db) {
        args.db = 'test';
    }
    args.home = args.db+'.db';
}

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
    err && console.error(err);
    process.exit(err?-1:0);
}
