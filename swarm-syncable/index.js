'use strict';
var Swarm = {
    Host: require('./src/Host'),
    Syncable: require('./src/Syncable'),
    OpStream: require('./src/OpStream'),
    get: get_fn
};

function get_fn (id, callback) {
    return Swarm.Syncable.defaultHost.get(id, callback);
}

module.exports = Swarm;
