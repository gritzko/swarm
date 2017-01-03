"use strict";

var Swarm = {
    Base64x64: require('./src/Base64x64'),
    Id: require('./src/Id'),
    Stamp: require('./src/Id'),
    Clock: require('./src/Clock'),
    Spec: require('./src/Spec'),
    Op: require('./src/Op'),
    Ops: require('./src/Ops'),
    VV: require('./src/VV'),
    Ids: require('./src/Ids'),
    ReplicaId: require('./src/ReplicaId'),
    ReplicaIdScheme: require('./src/ReplicaIdScheme'),
    VersionMap: require('./src/VersionMap')
};

module.exports = Swarm;
