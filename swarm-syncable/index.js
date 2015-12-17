var stamp = require("swarm-stamp");

var Swarm = {
    Spec: require('./src/Spec'),
    Op: require('./src/Op'),
    Host: require('./src/Host'),
    Syncable: require('./src/Syncable'),
    OpStream: require('./src/OpStream'),
    Model: require('./src/Model'),
    Set: require('./src/Set')
};

Object.keys(stamp).forEach(function(key){
    Swarm[key] = Swarm[key] || stamp[key];
});

module.exports = Swarm;
