var sync = require('swarm-syncable');
var Replica = require('./src/Replica');

var Swarm = { 
    Replica: Replica
};

Object.keys(sync).forEach(function(key){
    Swarm[key] = Swarm[key] || sync[key];
});

module.exports = Swarm;
