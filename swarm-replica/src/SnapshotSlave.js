'use strict';
var Swarm = require('..');
var Op = Swarm.Op;
var util = require("util");
var OpSource = Swarm.OpSource;
/**
* SnapshotSlave is a trimmed-down Host. Its only function is to produce
* state snapshots for CRDT types once Replica considers an op log "too long".
* It also compacts op logs (even those sent upstream).
* All the actual logic is type-dependent. Hence, it is implemented in
* respective CRDT classes.
* @class
* @implements {OpSource}
*/
function SnapshotSlave (options) {
    options = options || {};
    OpSource.call(this, options);
    this.options = options;
    if (options.on_handshake) {
        this.on('handshake', options.on_handshake);
    }
    var self = this;
    setImmediate(function(){ // hardly necessary
        self.emitHandshake('/Swarm+SnapSlave#0!0.on', '');
    });
}
util.inherits(SnapshotSlave, OpSource);
module.exports = SnapshotSlave;


SnapshotSlave.prototype._writeOp = function (op) {
    if (op.name()!=='on') {
        return;
    }
    var type_fn = Swarm.Syncable.types[op.spec.type()];
    var p = op.patch;
    if (!type_fn) {
        this.emitOp(op.spec.set('.error'), 'type unknown');
    } else if (!p || p.length<=1) {
        this.emitOp(op.spec, op.value, op.patch);
    } else if (p[0].name()==='~state') { // snapshot
        var crdt = new type_fn.Inner(p[0].value);
        for(var i=1; i<p.length; i++) {
            var o = p[i];
            crdt.write(o);
            crdt._version = o.stamp();
        }
        var state_spec = op.spec.typeId().add(crdt._version,'!').add('.~state');
        this.emitOp(op.spec, op.value, [[state_spec, crdt.toString()]]);
    } else if (type_fn.Inner.compact) { // compact
        var new_patch = type_fn.Inner.compact(p);
        this.emitOp(op.spec, op.value, new_patch);
    } else {
        this.emitOp(op.spec, op.value, op.patch);
    }
};
