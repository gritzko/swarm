#!/usr/bin/node
"use strict";
var argv = require('minimist')(process.argv.slice(2));
var api = require('./bat-api');
var fs = require('fs');

var scripts = argv._;
const json = !!(argv.j || argv.json);
if (scripts==null || scripts.length===0) {
    console.error("no script specified", argv);
    process.exit(3);
}

var script_file = scripts.shift(); // TODO script sequence

var script_body = fs.readFileSync(script_file).toString();

if (argv.whitespace && !/count|ignore|collapse|exact/.test(argv.whitespace))
    console.warn('invalid whitespace mode');

var options = {
    ignoreCase: argv.C,
    whitespace: argv.whitespace,
    anyOrder: argv.O,
    runAll: argv.x
};

var script = new api.BatScript(script_body, options);

var stream;

const exec = argv.exec || argv.e;
if (exec) {
    let args = exec.split(/\s+/);
    var proc = require('child_process').spawn(args.shift(), args, {
        stdio: ['pipe', 'pipe', process.stderr]
    });
    var duplex = require('duplexer');
    stream = duplex(proc.stdin, proc.stdout);
}

var stream_test = new api.StreamTest(script, stream);

stream_test.run ( results => {
    if (json)
        console.log(JSON.stringify(results, null, 4));
    else
        results.forEach(result =>
            process.stdout.write(result.toColorString())
        );
} );

