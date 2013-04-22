var url = require('url');
var childp = require('child_process');
var swarm = require('../lib/swarm.js');
var ws = require('ws');
var model = require('./mouse_model.js');

var BASE_PORT = 8000;
var PORT = (process.env.PORT&&parseInt(process.env.PORT))||BASE_PORT;

var wss = new ws.Server({
    port: PORT
});

var peer = new swarm.Peer(new swarm.ID('#',0,PORT-BASE_PORT+17));

wss.on('connection', function(ws) {
    var params = url.parse(ws.upgradeReq.url,true);
    // get peer id
    var src = parseInt(params.src);
    // check the secret
    // maybe grant ssn
    //ws.send({ssn:xx});
    var id = (new swarm.ID('*',src,17));
    var pipe = new swarm.Pipe(ws,peer,{});
    //peer.addPeer(pipe);
    // in Peer: kick out prev pipe
});

function fork(port) {
    console.warn('starting',port);
    var cp = childp.fork('./test/simpleserver.js',[],{
        env: {
            PORT: port
        }
    });
    cp.on('exit', function() {
        console.warn('exited',port);
        setTimeout(function(){
            fork(port);
        },4000);
    });
}

if (PORT==BASE_PORT)
    for(var i=1; i<=9; i++) 
        fork(BASE_PORT+i);

var urls = [];

for(var p=0; p<=9; p++) {
    var plumb = BASE_PORT + p;
    if (plumb<=PORT) continue;  // FIXME recipro
    urls.push('ws://localhost:'+plumb+'/peer');
}

var plumber = new swarm.Plumber(peer,urls);

if (PORT!==BASE_PORT)
    setTimeout(function(){
        process.exit(0);
    }, (180 + Math.random()*120)*1000 );
