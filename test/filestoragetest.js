var fs = require('fs');
var Swarm = require('../lib/swarm3.js');
require('../lib/swarm3-server.js');
var nopt = require('nopt');
var options = nopt({
    mode : [String, "write"]
});

Counter = Swarm.Model.extend('Counter',{
    defaults: {
        i : 0
    }
});

var store = './.store/';
var firstRun = !fs.exists(store);

var storage = new Swarm.FileStorage(store,host);
var host = new Swarm.Host('swarm',0,storage);
storage.host = host; // FIXME once once
Swarm.localhost = host;

Swarm.debug = true;

var counters = [];
    
for(var i=0; i<100; i++)
    counters.push(new Counter('counter'+i));
// FIXME wait for load
/*if (!firstRun) {
    for(var i=0; i<1000; i++)
        console.log(i,counters[i].i);
}*/

if (options.mode==='write') {
    // half a million ops must be enough
    for(var i=0; i<100; i++)
        for(var k=i; k<100; k++)
            counters[k].set({i:i}); // :)

    storage.rotateLog();
    storage.pullState();
} else if (options.mode==='check') {
    setTimeout(function(){
        for(var i=0; i<100; i++) {
            if (!counters[i]._version) {
            } else if (i===counters[i].i) {
            }
            if (counters[i]._version) {
                console.log(i,counters[i].i);
                //delete counters[i]._host;
                //delete counters[i]._lstn;
                //console.log(JSON.stringify(counters[i]),' === ',i);
            }
        }
    },4000);
} else {
    console.error('unrecognized mode: '+options.mode);
}

// exit before it settles
//setTimeout(function(){
//    process.exit(1);
//},1);
