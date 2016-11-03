'use strict';
var Swarm = {
    Host: require('./src/Client'),
    Client: require('./src/Client'),
    Cache: require('./src/Cache'),
    Syncable: require('./src/Syncable'),
    OpStream: require('./src/OpStream'),
    LWWObject: require('./src/LWWObject'),
    Swarm: require('./src/Swarm'),
    URL: require('./src/URL'),
    get: get_fn
};

function get_fn (id, callback) {
    return Swarm.Syncable.defaultHost.get(id, callback);
}

module.exports = Swarm;
