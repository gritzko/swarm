if (typeof exports === 'object') {
    Swarm = require('../../../lib/swarm3.js');
}

// Our key class: a mouse pointer :)
var Mouse = Swarm.Model.extend('Mouse', {
    defaults: {
        x: 0,
        y: 0,
        symbol: '?',
        ms: 0// last activity timestamp
    }
});

// this collection class has no functionality except for being a list
// of all mice currently alive; we'll only use one singleton object
// set mixin
var Mice = Swarm.Set.extend('Mice', {

});
// FIXME: server-side cleansing

// server state tracking: TODO

var PeerData = Swarm.Model.extend('PeerData', {
    defaults: {
    timeToRestart: 0,
        objectsTracked: 0
    }
});

if (typeof(exports)==='object') {
    exports.Mouse=Mouse;
    exports.Mice=Mice;
    exports.PeerData=PeerData;
}

console.log('\tmouse models defined ok');
