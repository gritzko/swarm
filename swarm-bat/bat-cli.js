#!/usr/bin/node
"use strict";
const argv = require('minimist')(process.argv.slice(2));
const api = require('./bat-api');
const fs = require('fs');
const cli = require('commander');
const su = require('stream-url');
const async = require('async');

cli
    .version('0.0.1')
    .usage("[option] <script.batt>")
    .option("-c --connect <url>", "")
    .option("-l --listen <url>", "")
    .option("-e --exec <cmd>", "")
    .option("-i --ignore-errors", "don't stop on errors")
    .option("-L --ignore-empty", "ignore empty lines")
    .option("-C --any-case", "ignore case")
    .option("-W --whitespace <policy>", "whitespace policy (count|ignore|collapse|exact)",
        /^(count|ignore|collapse|exact)$/)
    .option("-O --any-order", "lines may go in any order")
    .option("-d --max-delay", "max response delay time (ms, default 500)", parseInt)
    .option("-j --json", "JSON output")
    .option("-r --record <script>", "record mode (create a new BAT script")
    .option("-v --verbose", "verbose mode")
    .parse(process.argv);

const scripts = cli.args;
if (scripts.length===0) {
    console.error("no script specified", argv);
    process.exit(3);
}
const script_file = scripts.shift(); // TODO script sequence
const script_body = fs.readFileSync(script_file).toString();

const script_options = {
    ignoreCase: cli.anyCase,
    whitespace: cli.whitespace,
    anyOrder: cli.anyOrder,
    runAll: cli.ignoreErrors
};

const script = new api.BatScript(script_body, script_options);

if (cli.connect && cli.listen) {
    console.warn('either client or server mode');
    process.exit(1);
}

const run_options = {
    url: cli.connect,
    server: null,
    stream: null,
    runAll: cli.ignoreErrors
};

function listen (next) {
    if (!cli.listen) return next();
    su.listen(cli.listen, (err, server) => {
        run_options.server = server;
        next(err);
    });
}

function exec (next)  {
    if (!cli.exec) return next();
    const use_std = !cli.listen && !cli.connect;
    const duplexify = require('duplexify');
    let args = cli.exec.split(/\s+/);
    var proc = require('child_process').spawn(args.shift(), args, {
        stdio: [
            use_std?'pipe':process.stdin,
            use_std?'pipe':process.stdout,
            process.stderr
        ]
    });
    if (use_std)
        run_options.stream = duplexify(proc.stdin, proc.stdout);
    next();
}

function connect (next) {
    if (!cli.connect) return next();
    su.connect (cli.connect, (err, stream) => {
        run_options.stream = stream;
        run_options.url = cli.connect;
        next(err);
    });
} 

function run (next) {
    if (cli.verbose)
        api.StreamTest.debug = true;
    if (cli.maxDelay)
        api.StreamTest.LONG_DELAY = cli.maxDelay;
    var stream_test = new api.StreamTest(script, run_options);
    stream_test.run(next);
}

function report (results, stream_test, next) {
    if (cli.json) {
        console.log(JSON.stringify(results, null, 4));
    } else {
        results.forEach(result =>
            process.stderr.write(result.toColorString())
        );
    }
    next(null, results);
}

const actions = [
    listen,
    exec,
    connect,
    run,
    report
];

async.waterfall(actions, end);

function end (err, results) {
    if (err) {
        console.warn(err);
        process.exitCode = -1;
    } else if (!results.every(r=>r.ok)) {
        process.exitCode = 1;
    }
    if (run_options.stream)
        run_options.stream.end();
    if (run_options.server)
        run_options.server.close();
}
