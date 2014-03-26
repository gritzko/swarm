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
var Swarm = require('../../lib/swarm3.js'),
    Host = Swarm.Host,
    Spec = Swarm.Spec,
    Pipe = Swarm.Pipe,
    Syncable = Swarm.Syncable;

//model
require('./mouse_model.js');

Swarm.debug = false;
Syncable.prototype.log = function(spec,value,replica) {
    var myspec = this.spec().toString(); //:(
    topcon.log('@%s  %s %s  %j  %s@%s',
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


var CLUSTER_SIZE = 0;
var BASE_PORT = 8000;
var PORT = (process.env.PORT && parseInt(process.env.PORT, 10)) || BASE_PORT;

var topcon = new Console("MiceServer").grep(':' + PORT);

var res_cache = {};

var httpServer = http.createServer(function(req,res){
    var requrl = url_lib.parse(req.url);
    var pathname = requrl.pathname;
    //noinspection FallThroughInSwitchStatementJS
    switch (pathname) {
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
            res_cache[pathname] = fs.readFileSync('.' + pathname);
        //}
        res.end(res_cache[pathname]);
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


//TODO move DummyStorage
function DummyStorage(async) {
    this.async = !!async || false;
    this.states = {};
    this.tails = {};
    this._id = 'dummy';
}

DummyStorage.prototype.deliver = function (spec,value,src) {
    var ti = spec.filter('/#');
    //var obj = this.states[ti] || (this.states[ti]={_oplog:{},_logtail:{}});
    var tail = this.tails[ti];
    if (!tail)
        this.tails[ti] = tail = {};
    var vm = spec.filter('!.');
    if (vm in tail)
        console.error('op replay @storage');
    tail[vm] = value;
};
DummyStorage.prototype.on = function () {
    var spec, replica;
    if (arguments.length===2) {
        spec = new Swarm.Spec(arguments[0]);
        replica = arguments[1];
    } else
        throw 'xxx';
    var ti = spec.filter('/#'), self=this;
    function reply () {
        var state = self.states[ti];
        // FIXME mimic diff; init has id, tail has it as well
        if (state) {
            var response = {};
            response['!'+state._version+'.init'] = state;
            var tail = self.tails[ti];
            if (tail)
                for(var s in tail)
                    response[s] = tail[s];
            var clone = JSON.parse(JSON.stringify(response));
            replica.deliver(ti,clone,self);
        }
        replica.reon(ti,'!'+(state?state._version:'0'),self);
    }
    this.async ? setTimeout(reply,1) : reply();
};

DummyStorage.prototype.off = function () {
    this.normalizeSignature(arguments,'off');
    var self = this,
        spec = new Swarm.Spec(arguments[0]),
        replica = arguments[2],
        ti = spec.filter('/#');

    function reply () {
        replica.reoff(ti,null,self);
    }
    this.async ? setTimeout(reply,1) : reply();
};

DummyStorage.prototype.normalizeSignature = Swarm.Syncable.prototype.normalizeSignature;

var storage = new DummyStorage(true);

//var peer = new Swarm.Host(new Swarm.ID('#',0,PORT-BASE_PORT+17));
var peer = new Host('swarm~' + PORT, 0, storage);
Swarm.localhost = peer;

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
    pipe.console = topcon.grep(' in');
    pipe.connect();
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

function openWebSocket(port) {
    return new ws('ws://localhost:' + port + '/peer');
}

for(var p = BASE_PORT; p < PORT; p++) {
    var pipe = new Pipe(peer, null, {
        sink: openWebSocket.bind(this, p),
        messageEvent: 'message',
        openEvent: 'open',
        peerName: 'swarm:' + p
    });
    pipe.console = topcon.grep(' out');
    pipe.connect();
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

peer.on('/Mice#mice.init', function(spec, val, mice) {
    console.log('Mice inited spec=%s val=%j', spec, val);
    //TODO setInterval(cleanOfflineUsers, 20 * 1000);
});


function cleanOfflineUsers() { // temp hack
    var now = Spec.base2int(new Spec('!' + peer.version()).token('!').bare);
    for(var mid in mice) if (mice.hasOwnProperty(mid)) {
        if (mice[mid]) {
            var mouse = mice[mid];
            var version = mouse.version();
            if (!version) continue;
            var ts = Spec.base2int(new Spec('!' + version).token('!').bare);
            if (ts < now - 120) {
                mice.set(mid, null);
                console.error('' + peer._id + ' KILLS ' + mid + ' cause ' + vid.ts + '<' + now + '-120');
            }
        }
    }
}
