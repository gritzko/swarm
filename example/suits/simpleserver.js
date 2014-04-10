//node.js libs
var url_lib = require('url');
var fs = require('fs');
var util = require('util');
var http = require('http');
var childp = require('child_process');

//other libs
var ws_lib = require('ws');
var Console = require('context-logger');

//Swarm
var Swarm = require('../../lib/swarm3.js'),
    Host = Swarm.Host,
    Spec = Swarm.Spec,
    Pipe = Swarm.Pipe,
    Syncable = Swarm.Syncable;

var WSWrapper = require('../../lib/wswrapper.js');

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
var CLEANOFF_INTERVAL = 20 * 1000;
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
    case '/example/suits/client_ws_wrapper.js':
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

var wss = new ws_lib.Server({
    server: httpServer
});


//TODO move DummyStorage
function DummyStorage(async) {
    this.async = !!async || false;
    this.states = {};
    this.tails = {};
    this._id = 'dummy';
};

DummyStorage.prototype.version = Swarm.Host.prototype.version;

DummyStorage.prototype.deliver = function (spec,value,src) {
    if (spec.method()==='on')
        return this.on(spec,value,src);
    // stash the op
    var ti = spec.filter('/#');
    var tail = this.tails[ti];
    if (!tail)
        this.tails[ti] = tail = {};
    var vm = spec.filter('!.');
    if (vm in tail)
        console.error('op replay @storage');
    tail[vm] = value;
};

DummyStorage.prototype.on = function (spec,base,replica) {
    spec = new Swarm.Spec(spec);
    var ti = spec.filter('/#'), self=this;
    function reply () {
        // authoritative storage: no thing => return empty
        var state = self.states[ti];
        if (!state && base==='!0' && !spec.token('#').ext) {
            state={ _version: self.version() };
        }
        // FIXME mimic diff; init has id, tail has it as well
        var response = {};
        if (state)
            response['!'+state._version+'.init'] = state;
        var tail = self.tails[ti];
        if (tail)
            for(var s in tail)
                response[s] = tail[s];
        var clone = JSON.parse(JSON.stringify(response));
        replica.deliver(spec.set('.bundle'),clone,self);
        replica.__reon( ti.add(spec.version(),'!').add('.reon'),
                        '!'+(state?state._version:'0'), self );
    }
    this.async ? setTimeout(reply,1) : reply();
};

DummyStorage.prototype.off = function (spec,value,src) {
};

var storage = new DummyStorage(true);

//var peer = new Swarm.Host(new Swarm.ID('#',0,PORT-BASE_PORT+17));
var peer = new Host('swarm~' + PORT, 0, storage);
Swarm.localhost = peer;

var portStr = ''+PORT;
while (portStr.length<6) portStr = '0'+portStr;

wss.on('connection', function(ws) {
    var params = url_lib.parse(ws.upgradeReq.url,true);
    // get peer id
    var src = parseInt(params.src);
    topcon.debug('wsOpened %s', params.path);
    // check the secret
    // maybe grant ssn
    //ws.send({ssn:xx});
    //var id = (new Swarm.Spec('*',src,17));
    var pipe = new Pipe({
        host: peer,
        sink: new WSWrapper(ws)
    });
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
    return new WSWrapper(new ws_lib('ws://localhost:' + port + '/peer'));
}

for(var p = BASE_PORT; p < PORT; p++) {
    var pipe = new Pipe({
        host: peer,
        transport: openWebSocket.bind(this, p),
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
var mice = null;

peer.on('/Mice#mice.init', function(spec, val, mice_inited) {
    mice = mice_inited;
    console.log('Mice inited spec=%s val=%j', spec, val);
    setInterval(cleanOfflineUsers, CLEANOFF_INTERVAL);
});

peer.on('/PeerData#' + portStr + '.init', function (spec, val, peerData) {
    console.log('PeerData inited spec=%s val=%j', spec, val);
});


function cleanOfflineUsers() { // temp hack
    var now = Spec.base2int(Spec.parseToken(peer.version()).bare);
    var mice_pojo = mice.pojo();
    for(var mid in mice_pojo) {
        if (mice_pojo[mid]) {
            var mouse = mice.get(mid);
            var mouse_version_vector = mouse.version();
            if (!mouse_version_vector) continue;

            var mouse_version_ts = new Spec.Map(mouse_version_vector).maxTs().substr(0, 5);

            var ts = Spec.base2int(mouse_version_ts);
            if (ts < now - 120) {
                mice.remove(mid);
                topcon.warn('' + peer._id + ' KILLS ' + mid + ' cause ' + ts + '<' + now + '-120');
            }
        }
    }
}
