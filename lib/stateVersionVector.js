'use strict';

var VersionVector = require('./VersionVector');

function stateVersionVector (state) {
    var op,
        map = new VersionVector(state._version + (state._vector || ''));
    if (state._oplog) for (op in state._oplog) map.add(op);
    if (state._tail) for (op in state._tail) map.add(op);
    return map.toString();
}

module.exports = stateVersionVector;
