// Simple Swarm sync server: picks model classes from a directory,
// starts a WebSocket server at a port. Serves some static content,
// although I'd recomment to shield it with nginx.
var fs = require('fs');
var path = require('path');
var url = require('url');
var http = require('http');
var Swarm = require('./lib/swarm3.js');
var swarmServ = require('./lib/swarm3-server.js');
var nopt = require('nopt');
var koa = require('koa');
var app = koa();
var ws_lib = require('ws');

var options = nopt({
    models : path,
    port : Number
});

var koa_static = require('koa-static-cache');
app.use(koa_static('.'));

// boot model classes
var modelPathList = options.models||'model/';
modelPathList.split(/[\:;,]/g).forEach(function (modelPath) {
    modelPath = path.resolve(modelPath);
    console.log('scanning',modelPath);
    var modelClasses = fs.readdirSync(modelPath), modelFile;
    while (modelFile = modelClasses.pop()) {
        if (!/^\w+\.js$/.test(modelFile)) continue;
        var modpath = path.join(modelPath, modelFile);
        console.log('Loading model file', modpath);
        var mod = require(modpath);
        for (var item in mod) {
            var fn = mod[item];
            console.log('checking',item);
            if (fn.constructor !== Function) continue;
            console.log('...');
            if (fn.extend !== Swarm.Syncable.extend) continue;
            console.log('\tmodel class found:\t', item);
        }
    }
});

// use file storage
var fileStorage = new Swarm.FileStorage('.swarm');

// create Swarm Host
var swarmHost = new Swarm.Host('swarm~nodejs', 0, fileStorage);
Swarm.localhost = swarmHost;

// start the HTTP server
var port = options.port || 8000;
var httpServer = http.createServer(app.callback()).listen(port);
console.log('Swarm server started port',port);

// start WebSocket server
var wsServer = new ws_lib.Server({
    server: httpServer
});

// add pipes
wsServer.on('connection', function(ws) {
    var params = url.parse(ws.upgradeReq.url,true);
    console.log('incomingWS %s', params.path);
    // check the secret
    // FIXME grant ssn
    swarmHost.accept(new swarmServ.EinarosWSStream(ws));
});

// TODO pexing
