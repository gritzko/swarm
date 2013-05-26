var url = require('url');
var util = require('util');
var http = require('http');
var childp = require('child_process');
var swarm = require('../lib/swarm.js');
var ID = swarm.ID, Peer = swarm.Peer, Spec = swarm.Spec;
var ws = require('ws');
var model = require('./mouse_model.js');

var BASE_PORT = 8000;
var PORT = (process.env.PORT&&parseInt(process.env.PORT))||BASE_PORT;

var httpServer = http.createServer(function(req,res){
    var requrl = url.parse(req.url);
    if (requrl.path=='/dump') {
        res.end(util.inspect(peer._lstn,{depth:4}));
    } else
        res.end('Swarm test server: mouse tracking');
});
httpServer.listen(PORT);

var wss = new ws.Server({
    server: httpServer
});

var peer = new swarm.Peer(new swarm.ID('#',0,PORT-BASE_PORT+17));

var portStr = ''+PORT;
while (portStr.length<6) portStr = '0'+portStr;
var peerData = peer.on('/=Peer=#'+portStr);

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
        },8000);
    });
}

if (PORT==BASE_PORT)
    for(var i=1; i<=9; i++) 
        fork(BASE_PORT+i);

var RESTART_TS = -1;

setInterval(function(){
    //swarm.Spec.ANCIENT_TS = swarm.ID.int3uni(swarm.ID.getTime()-60*60);
    peerData.setTimeToRestart(RESTART_TS>0?RESTART_TS-new Date().getTime():0);
},1000);

var urls = [];

for(var p=0; p<=9; p++) {
    var plumb = BASE_PORT + p;
    if (plumb<=PORT) continue;  // FIXME recipro
    urls.push('ws://localhost:'+plumb+'/peer');
}

var plumber = new swarm.Plumber(peer,urls);

// (scheduled) server restart
if (PORT!==BASE_PORT) {
    var waitMs = (30 + Math.random()*30)*1000;
    RESTART_TS = new Date().getTime() + waitMs;
    setTimeout(function(){
        process.exit(0);
    }, waitMs );
}

var mice = peer.on('/=Mice=#=mice=');
function cleanOfflineUsers () { // temp hack
    var now = ID.getTime();
    for(var mid in mice)
        if (mice[mid]) {
            var version = Spec.getPair(mice._vmap,mid);
            if (!version) continue;
            var vid = ID.as(version);
            if (vid.ts<now-120) {
                mice.set(mid,null);
                console.error(''+peer._id+' KILLS '+mid+' cause '+vid.ts+'<'+now+'-120');
            }
        }
}
setInterval(cleanOfflineUsers,20*1000);

