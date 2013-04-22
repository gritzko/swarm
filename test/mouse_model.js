if (typeof(module)!=='undefined')
    swarm = require('../lib/swarm.js');

function Mouse() { // FIXME model.js
    this.x = 0;
    this.y = 0;
    this.ms = 0;
}

swarm.Peer.extend(Mouse,'/=Mouse');

function Mice () {
}

swarm.Peer.extendSet(Mice);
