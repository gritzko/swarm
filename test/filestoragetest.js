"use strict";

// FIXME UPDATE, integrate into Makefile

var nopt = require('nopt'),
    options = nopt({
        mode : [String, "write"]
    }),
    Swarm = require('../lib/NodeServer');

Swarm.env.debug = true;

var Counter = Swarm.Model.extend('Counter',{
    defaults: {
        i: 0
    }
});

var store = './.store/',
    storage = new Swarm.FileStorage(store),
    host = new Swarm.Host('swarm', 0, storage);

Swarm.localhost = host;

Swarm.debug = true;

var counters = [];
for (var i = 0; i < 100; i++) {
    counters.push(new Counter('counter' + i));
}

switch (options.mode) {
case 'write':

    // half a million ops must be enough
    for (i = 0; i < 10; i++) {
        for (var k = i; k < 100; k++) {
            counters[k].set({i: i}); // :)
        }
    }

    storage.close();

    break;

case 'check':

    setTimeout(function(){ // TODO collection onload()
        for (var i = 0; i < 100; i++) {
            if (counters[i]._version) {
                console.log(i, counters[i].i);
            }
        }
    },4000);

    break;

default:
    console.error('unrecognized mode: ' + options.mode);
}

// exit violently
//setTimeout(function(){
//    process.exit(1);
//},1);
