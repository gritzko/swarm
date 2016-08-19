'use strict';
var Swarm = {
    Host: require('./src/Host'),
    Syncable: require('./src/Syncable'),
    OpStream: require('./src/OpStream'),
    LWWObject: require('./src/LWWObject'),
    Swarm: require('./src/SwarmMeta'),
    get: get_fn
};

function get_fn (id, callback) {
    return Swarm.Syncable.defaultHost.get(id, callback);
}

module.exports = Swarm;
