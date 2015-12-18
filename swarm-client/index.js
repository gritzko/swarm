var replica = require('swarm-replica');
var Client = require('./src/Client');

var Swarm = { 
    Client: Client
};

Object.keys(replica).forEach(function(key){
    Swarm[key] = Swarm[key] || replica[key];
});

module.exports = Swarm;
