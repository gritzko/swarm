#!/usr/bin/env node
"use strict";
const swarm = require('swarm-protocol');
const args = require('minimist')(process.argv.slice(2));

var help = [
    '',
    'Command-line Swarm client. Usage: ',
    '    swarm [-C|-F|-A|-R] path/to/database-id [options]',
    '',
    '-C --create            create a database (dir name == db name)',
    '    -n --name dbname   database name (default: take from the path)',
    '    -i --id XY         replica id (default: take from the path)',
    '    --oXxx="Yyy"       set a global database option Xxx to "Yyy"',
    '    --OXxx="Yyy"       set a scoped database option',
    '-F --fork              fork a database',
    '    -t --to /path/dbname-YZ  a path for the new replica',
    '    -i --id YZ         new replica id',
    '-A --access            access a database',
    '    -s --scan /Type#id!prefix  list all records under a prefix',
    '    -e --erase /Type#id!prefix  erase records',
    '    -p --put filename  add ops to the database',
    '    -v --vv print the version vector',
    "    -g --get /Type#id  print the object's state (merge ops)",
    '    --OXxx, --0Xxx     edit database options (as above)',
    '-R --run               run a database (the default)',
    '    -l --listen scheme:url listen for client conns on URL',
    '        (WebSocket ws://host:port, TCP tcp:...)',
    '    -c --connect scheme:url connect to a peer',
    '    -e --exec script.js execute a script once connected (default: REPL)',
    '    -d --daemon        daemonize',
    '    -i --ingest file.op ingest ops from a file (default: stdin/out)',
    '    -f --filter        grep log events (e.g. -f /Swarm.on.off)',
    '    -a --auth          auth OpStream implementation (default: trusty)',
    '-U --user add/remove/list users/clients',
    '    -a --add login add a user (take the password from stdin)',
    '    -r --remove login',
    '    -l --list',
    '',
    '-T --trace [SLP]       trace op processing pipeline (switch/log/patch)',
    ''
].join('\n');

if (args.h || args.help) {
    console.log(help);
    process.exit(0);
}

let create = args.C || args.create;
let fork = args.F || args.fork;
let access = args.A || args.access;
let run = args.R || args.run;
let user = args.U || args.user;

if (create) {
    require('./src/create')(create, args, done);
} else if (fork) {
    require('./src/fork')(fork, args, done);
} else if (access) {
    require('./src/access')(access, args, done);
} else if (run) {
    require('./src/run')(run, args, done);
} else if (user) {
    require('./src/user')(user, args, done);
} else {
    console.log(help);
    done('no run mode specified');
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
