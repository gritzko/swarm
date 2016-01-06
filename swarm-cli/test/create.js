'use strict';
var Swarm = require('swarm-client');

var alice = new Swarm.Model({
    name: 'Alice',
    eyes: '#89CFF0'
});

console.log(alice._id);
