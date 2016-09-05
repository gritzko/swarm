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

var options = {
    ignoreCase: argv.C,
    collapseWhitespace: argv.W,
    anyOrder: argv.O,
    runAll: argv.x
};

var script = new api.BatScript(script_body, options);

var stream;

if (argv.e) {
    var proc = require('child_process').exec(argv.e);
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

