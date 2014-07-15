'use strict';

var options      = require('./options');
var hash         = options.hashFunction;

var HASH_POINTS = 3;

function hashDistance(peer, obj) {
    if ((obj).constructor !== Number) {
        if (obj._id) obj = obj._id;
        obj = hash(obj);
    }
    if (peer._id) peer = peer._id;
    var dist = 4294967295;
    for (var i = 0; i < HASH_POINTS; i++) {
        var h = hash (peer._id + ':' + i);
        dist = Math.min(dist, h ^ obj);
    }
    return dist;
}

module.exports = hashDistance;
