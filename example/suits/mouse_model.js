if (typeof(module)!=='undefined')
    swarm = require('../lib/swarm.js');

// Our key class: a mouse pointer :)
function Mouse() {
    this.x = 0;
    this.y = 0;
    this.ms = 0; // last activity timestamp
}

// add mixin methods
swarm.Peer.extend(Mouse,'/=Mouse');

// this collection class has no functionality except for being a list
// of all mice currently alive; we'll only use one singleton object
function Mice () {
}
// set mixin
swarm.Peer.extendSet(Mice,'/=Mice=');

// server state tracking: TODO
function PeerData () {
    this.timeToRestart = 1<<30;
    this.objectsTracked = 0;
}

swarm.Peer.extend(PeerData,'/PeerDt');

