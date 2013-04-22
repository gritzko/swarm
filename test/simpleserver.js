var url = require('url');
var swarm = require('../lib/swarm.js');
var ws = require('ws');
var model = require('./mouse_model.js');

// process args  cfg default
var cfg = {};

var wss = new ws.Server({
    port: cfg.port||8000
});

var peer = new swarm.Peer(new swarm.ID('#',0,cfg.ssn||0));

wss.on('connection', function(ws) {
    var params = url.parse(ws.upgradeReq.url,true);
    // get peer id
    var src = parseInt(params.src);
    // check the secret
    // maybe grant ssn
    //ws.send({ssn:xx});
    var id = (new swarm.ID('*',src,17));
    var pipe = new swarm.Pipe(ws,peer,cfg);
    //peer.addPeer(pipe);
    // in Peer: kick out prev pipe
});
