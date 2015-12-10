"use strict";

// Swarm objects are split into two orthogonal parts, kind of Jekyll and Hyde.
// The inner state (CRDT) is a cleanroom math-only CRDT implementation.
// It is entirely passive and perfectly serializable.
// CRDT travels on the wire, gets saved into the DB, etc.
// The outer state (Syncable) is a "regular" JavaScript object which is exposed
// in the API. A Syncable is a mere projection of its CRDT. Still, all mutations
// originate at a Syncable. This architecture is very similar to MVC, where
// Syncable is a "View", CRDT is a "Model" and the Host is a "Controller".

// CRDT itself is an abstract no-op class, all the actual CRDTs inherit from it.

// The same applies to Syncable.
export default class CRDT {

    constructor(state_string, syncable) {
        this._version = null;
        this._syncable = syncable || null;
        state_string; // ...parse the serialized state
    }

    // update the outer (API) state
    updateSyncable(obj) {
        var syncable = obj || this._syncable;
        syncable; // update the object
        syncable.emit('change');
        return syncable;
    }

    // Returns the serialized state that the constructor understands.
    toString() {
        return '';
    }

    // it must never throw!
    write(op) {
        switch(op.name()) {
        // case 'op': this.op(op.value, op.stamp());
        default: console.error("Syncable has no ops", op);
        }
        this._version = op.stamp();
    }
}
