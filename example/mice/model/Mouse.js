"use strict";

var Model = require('../../../lib/Model');

// Our key class: a mouse pointer :)
module.exports = Model.extend('Mouse', {
    defaults: {
        x: 0,
        y: 0,
        symbol: '?',
        ms: 0// last activity timestamp
    }
});


// server state tracking: TODO

/*var PeerData = Swarm.Model.extend('PeerData', {
    defaults: {
    timeToRestart: 0,
        objectsTracked: 0
    }
});

if (typeof(exports)==='object') {
    exports.Mouse=Mouse;
    exports.Mice=Mice;
    exports.PeerData=PeerData;
}*/

console.log('\tmouse models defined ok');
