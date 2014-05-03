// Simple Swarm sync server: picks model classes from a directory,
// starts a WebSocket server at a port. Serves some static content,
// although I'd recomment to shield it with nginx.
var fs = require('fs');
var path = require('path');
var swarm = require('./lib/swarm3.js');
var koa = require('koa');
var app = koa();
var nopt = require('nopt');

var options = nopt({
    models : path,
    port : Number
});

var koa_static = require('koa-static');
app.use(koa_static('.'));

var knownModels = {'Model': swarm.Model};

// boot model classes
var modelPath = options.models||'model/';
console.log(modelPath);
var modelClasses = fs.readdirSync(modelPath), modelFile;
while (modelFile=modelClasses.pop()) {
    if (!/^\w+\.js$/.test(modelFile)) continue;
    console.log('Loading model file',modelFile);
    var mod = require(path.join(modelPath,modelFile));
    for(var item in mod) {
        var fn = mod[item];
        if (fn.constructor!==Function) continue;
        if (fn.extend!==swarm.Syncable.extend) continue;
        console.log('\tmodel class found:\t',item);
        knownModels[item] = fn;
    }
}

// use file storage

var port = options.port || 8000;
app.listen(port);
console.log('Swarm server started port',port);
