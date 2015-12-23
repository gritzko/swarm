"use strict";

// Swarm objects are split into two orthogonal parts, kind of Jekyll and Hyde.
// The inner state (CRDT) is a cleanroom math-only CRDT implementation.
// It is entirely passive and perfectly serializable.
// CRDT travels on the wire, gets saved into the DB, etc.
// The outer state (Syncable) is a "regular" JavaScript object which is exposed
// in the API. A Syncable is a mere projection of its CRDT. Still, all mutations
// originate at a Syncable. This architecture is very similar to MVC, where
// Syncable is a "View", CRDT is a "Model" and the Host is a "Controller".
// CRDT itself is an abstract no-op class that manifests all the necessary
// methods. All the actual CRDTs may inherit from it for simply take it a an
// example.
function CRDT (serialized_state_string, syncable) {
    this._version = null;
    this._syncable = syncable || null;
    serialized_state_string; // must be parsed in the ancestor class
}
module.exports = CRDT;

// update the outer (API) state
CRDT.prototype.updateSyncable = function (obj) {
    var syncable = obj || this._syncable;
    syncable; // update the object
    syncable.emit('change');
    return syncable;
};

// Returns the serialized state that the constructor understands.
CRDT.prototype.toString = function () {
    return 'this must be overloaded';
};

// Syncable CmRDT objects use state machine replication. The only
// difference from the classic case is that operations are not linear
// but partially ordered (http://bit.ly/1Nl3ink, http://bit.ly/1F07aZ0)
// Thus, a state of a CRDT object is transferred to a replica using
// some combination of state snapshots (POJO) and operation logs.
// The .~state pseuso-operation ferries states from replica to replica.
// Its value is produced by CRDT's toString() and consumed by the
// constructor. Other ops are consumed by write() which is a dispatcher
// method. This method must never throw!
CRDT.prototype.write = function (op) {
    switch(op.name()) {
    case 'noop': this.noop(op.value, op.stamp()); break;
    default: console.error("no such op", op);
    }
    this._version = op.stamp();
};


CRDT.prototype.noop = function (value, stamp) {
    "do nothing";
};
