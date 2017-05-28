"use strict";

var Swarm = {
    Grammar: require('./src/Grammar.js'),
    Base64x64: require('./src/Base64x64.js'),
    Clock: require('./src/Clock.js'),
    Frame: require('./src/Frame.js'),
    Op: require('./src/Op.js'),
    ReplicaId: require('./src/ReplicaId.js'),
    ReplicaIdScheme: require('./src/ReplicaIdScheme.js'),
    UUID: require('./src/UUID.js'),
    UUIDVector: require('./src/UUIDVector.js')
};

module.exports = Swarm;
