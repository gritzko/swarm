//node.js libs
var url_lib = require('url');
var fs = require('fs');
var util = require('util');
var http = require('http');
var childp = require('child_process');

//other libs
var ws = require('ws');
var Console = require('context-logger');

//Swarm
var Swarm = require('../../lib/Swarm3.js'),
    ID = Swarm.ID,
    Host = Swarm.Host,
    Spec = Swarm.Spec,
    Pipe = Swarm.Pipe,
    Syncable = Swarm.Syncable;

//model
var model = require('./mouse_model.js');

Swarm.debug = true;
Syncable.prototype.log = function(spec,value,replica) {
    var myspec = this.spec().toString(); //:(
    topcon.log('@%s  %s %s  %s  %s@%s',
            //"color: #888",
            this._host._id,
            //"color: #246",
            this.spec().toString(),
            //"color: #024; font-style: italic",
            (myspec==spec.filter('/#')?
                    spec.filter('!.').toString() :
                    spec.toString()),
            //"font-style: normal; color: #042",
            (value&&value.constructor===Spec?value.toString():value),
            //"color: #88a",
            (replica&&((replica.spec&&replica.spec().toString())||replica._id)) ||
                    (replica?'no id':'undef'),
            //"color: #ccd",
            replica&&replica._host&&replica._host._id
            //replica&&replica.spec&&(replica.spec()+
            //    (this._host===replica._host?'':' @'+replica._host._id)
    );
};


var CLUSTER_SIZE = 2;
var BASE_PORT = 8000;
var PORT = (process.env.PORT && parseInt(process.env.PORT, 10)) || BASE_PORT;

var topcon = new Console("MiceServer").grep(':' + PORT);

var res_cache = {};

var httpServer = http.createServer(function(req,res){
    var requrl = url_lib.parse(req.url);
    var path = requrl.path;
    //noinspection FallThroughInSwitchStatementJS
    switch (path) {
    case '/dump':
        res.end(util.inspect(peer._lstn,{depth:4}));
        break;

    case '/example/suits/mouse.js':
    case '/example/suits/mouse_model.js':
    case '/lib/murmur.js':
    case '/lib/swarm3.js':
        res.setHeader('Content-Type', 'text/javascript');

    case '/example/suits/grid.html':
    case '/example/suits/cell.html':
    case '/example/suits/millim.gif':
    case '/example/suits/millim-mono.gif':
        //if (!res_cache[path]) {
            res_cache[path] = fs.readFileSync('.' + path);
        //}
        res.end(res_cache[path]);
        break;
    default:
        res.end('Swarm test server: mouse tracking');
    }
});
httpServer.on('listening', function () {
    topcon.info('listening');
});
httpServer.listen(PORT);

var wss = new ws.Server({
    server: httpServer
});

//var peer = new Swarm.Host(new Swarm.ID('#',0,PORT-BASE_PORT+17));
var peer = new Host('Swarm~' + (PORT - BASE_PORT + 17));

var portStr = ''+PORT;
while (portStr.length<6) portStr = '0'+portStr;
//var peerData = peer.on('/PeerData#'+portStr);

wss.on('connection', function(ws) {
    var params = url_lib.parse(ws.upgradeReq.url,true);
    // get peer id
    var src = parseInt(params.src);
    topcon.debug('wsOpened %s', params.path);
    // check the secret
    // maybe grant ssn
    //ws.send({ssn:xx});
    //var id = (new Swarm.Spec('*',src,17));
    var pipe = new Pipe(peer, ws, {messageEvent: 'message'});
    //peer.addPeer(pipe);
    // in Peer: kick out prev pipe
});

function fork(port) {
    topcon.warn('start...',port);
    var cp = childp.fork('./example/suits/simpleserver.js',[],{
        env: {
            PORT: port
        }
    });
    cp.on('exit', function() {
        topcon.warn('exited',port);
        setTimeout(function(){
            fork(port);
        },8000);
    });
}

if (PORT == BASE_PORT) {
    for(var i = 1; i <= CLUSTER_SIZE; i++) {
        fork(BASE_PORT+i);
    }
}

/*
var RESTART_TS = -1;

setInterval(function(){
    //Swarm.Spec.ANCIENT_TS = Swarm.ID.int3uni(Swarm.ID.getTime()-60*60);
    peerData.setTimeToRestart(RESTART_TS > 0 ? RESTART_TS - new Date().getTime() : 0);
},1000);
*/

//connect to all previously started servers
for(var p = BASE_PORT + 1; p < PORT; p++) {
    new Pipe(peer, new ws('ws://localhost:' + p + '/peer'), {messageEvent: 'message'});
}

// (scheduled) server restart
/*
if (PORT !== BASE_PORT) {
    var waitMs = (60 + Math.random()*60)*1000;
    RESTART_TS = new Date().getTime() + waitMs;
    setTimeout(function(){
        process.exit(0);
    }, waitMs );
}
*/

/*TODO
var mice = peer.on('/Mice#mice');
function cleanOfflineUsers () { // temp hack
    var now = ID.getTime();
    for(var mid in mice.map)
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
*/

