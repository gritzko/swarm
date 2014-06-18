var fs = require('fs'),
    nopt = require('nopt'),
    options = nopt({
        mode : [String, "write"]
    }),
    Swarm = require('../lib/swarm3.js');

require('../lib/swarm3-server.js');

Counter = Swarm.Model.extend('Counter',{
    defaults: {
        i: 0
    }
});

var store = './.store/',
    firstRun = !fs.existsSync(store),
    storage = new Swarm.FileStorage(store),
    host = new Swarm.Host('swarm', 0, storage),
    i;

Swarm.localhost = host;

Swarm.debug = true;

var counters = [];
for (i = 0; i < 100; i++) {
    counters.push(new Counter('counter' + i));
}

// FIXME wait for load
/*if (!firstRun) {
    for (var i=0; i<1000; i++)
        console.log(i,counters[i].i);
}*/

switch (options.mode) {
case 'write':

    // half a million ops must be enough
    for (i = 0; i < 100; i++)
        for (var k = i; k < 100; k++)
            counters[k].set({i: i}); // :)

    storage.rotateLog();
    storage.pullState();

    break;

case 'check':

    setTimeout(function(){ // TODO collection onload()
        for (var i = 0; i < 100; i++) {
            if (!counters[i]._version) {
            } else if (i === counters[i].i) {
            }
            if (counters[i]._version) {
                console.log(i, counters[i].i);
                //delete counters[i]._host;
                //delete counters[i]._lstn;
                //console.log(JSON.stringify(counters[i]),' === ',i);
            }
        }
    },4000);

    break;

default:
    console.error('unrecognized mode: ' + options.mode);
}

// exit before it settles
//setTimeout(function(){
//    process.exit(1);
//},1);
