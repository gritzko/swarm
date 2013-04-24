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
        },8000);
    });
}

if (PORT==BASE_PORT)
    for(var i=1; i<=9; i++) 
        fork(BASE_PORT+i);

setInterval(function(){
    //swarm.Spec.ANCIENT_TS = swarm.ID.int3uni(swarm.ID.getTime()-60*60);
},1000);

var urls = [];

for(var p=0; p<=9; p++) {
    var plumb = BASE_PORT + p;
    if (plumb<=PORT) continue;  // FIXME recipro
    urls.push('ws://localhost:'+plumb+'/peer');
}

var plumber = new swarm.Plumber(peer,urls);

/*
// (scheduled) server restart
if (PORT!==BASE_PORT)
    setTimeout(function(){
        process.exit(0);
    }, (30 + Math.random()*30)*1000 );
*/

var mice = peer.on('/=Mice=#=mice=');
function cleanOfflineUsers () { // temp hack
    for(var mid in mice)
        if (mice[mid]) {
            var oid = mid.replace('.','#');
            if (!peer._lstn[oid]) continue;
            var obj = peer.findObject(oid);
            if (!obj) continue; // ???
            if (!obj.ms) continue; // a new one; FIXME
            var minuteAgo = new Date().getTime()-60*1000;
            if (obj.ms < minuteAgo) { // likely disconnected
                mice.set(mid,null);
                console.error(''+peer._id+' KILLS '+mid+': '+obj.ms+' < '+
                        minuteAgo );
            }
        }
}
setInterval(cleanOfflineUsers,20*1000);

/*peer._on('/=Room=', function (spec,val) {
    spec = swarm.Spec.as(spec);
    console.error('ROOM '+spec+'\t'+JSON.stringify(val));
    for(var client in val) {
        var clientId = client.replace('.','#');
        if (client in peer.peers) {
            var c = peer.peers[client];
            c.rooms = c.rooms || {};
            c.rooms[spec.id] = true;
            console.error('peer '+clientId+' joined room '+spec.id);
        }
    }
});


peer._on('/=Peer=',function(spec,isConnected){
    spec = swarm.Spec.as(spec);
    var id = spec.id, fid = id.toString().replace('#','.');
    console.error('!!! '+peer._id+' '+(isConnected?'':'dis')+'connects: '+id);
    if (!isConnected) {
        var p = peer.peers[id];
        if (p.rooms)
            for (var roomid in p.rooms) {
                var room = peer.findObject(roomid);
                room.set(fid,false);
                console.error('### kicked '+fid+' out of '+roomid);
            }
    }
}); */
