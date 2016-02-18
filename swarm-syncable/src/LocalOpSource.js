"use strict";
var util         = require("util");
var OpSource = require('./OpSource');

function LocalOpSource (options, pair) {
    OpSource.call(this);
    if (pair) {
        this.pair = pair;
    } else {
        this.pair = new LocalOpSource(options,this);
    }
}
util.inherits(LocalOpSource, OpSource);
module.exports = LocalOpSource;

OpSource.prototype._writeOp = function (op, callback) {
    var kv_patch = !op.patch ? null : op.patch.map(function(o){
        return [o.spec, o.value];
    });
    this.pair.emitOp(op.spec, op.value, kv_patch);
};

OpSource.prototype._writeHandshake = function (op, callback) {
    var kv_patch = !op.patch ? null : op.patch.map(function(o){
        return [o.spec, o.value];
    });
    this.pair.emitHandshake(op.spec, op.value, kv_patch);
};

OpSource.prototype._writeEnd = function (op, callback) {
    this.pair.emitEnd(op?op.value:null);
};
