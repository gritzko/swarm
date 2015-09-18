"use strict";
var stamp = require('swarm-stamp');
var AnchoredVV = stamp.AnchoredVV;
var VVector = stamp.VVector;
var sync = require('swarm-syncable');
var Op = sync.Op;


function Request (replica, meta, op) {
    this.meta = meta;
    this.subscriptions = meta.subscriptions;
    this.op = op;
    this.typeid = op.typeid();
    this.replica = replica;
    this.save_queue = [];
    this.send_queue = [];
}
module.exports = Request;


Request.prototype.saveMeta = function (key, value) {
    this.meta[key] = value;
    this.save_queue.push(new Op('.'+key, value));
};


Request.prototype.send = function (op, to_ssn) {
    if (to_ssn || op.source!==this.op.source) {
        op = op.relay(to_ssn||this.op.source);
    }
    this.send_queue.push(op);
};


Request.prototype.save = function (op) {
    this.save_queue.push(op);
};


Request.prototype.done = function () {
    this.replica.done(this);
};


Request.prototype.process = function () {
    switch (this.op.name()) {
    case 'on':    this.processOn(); break;
    case 'off':   this.processOff(); break;
    case 'state': this.processState(this.op); break;
    default:      this.processOp(this.op); break;
    }
};


Request.prototype.processOn = function () {
    var source = this.op.origin(); // FIXME not op.source (there are .on hints)
    var is_source_upstream = source === this.upstream;
    var ack_vv = new VVector();

    // first, process the patch
    var ops = this.op.unbundle();
    for (var i=0; ops && i<ops.length; i++) {
        var diff_op = ops[i];
        switch (diff_op.op()) {
        case 'on':
        case 'off':
            this.send(this.op.error('invalid patch'));
        return;
        case 'state':
            if (this.meta.tip!=='0' && this.op.source!==this.upstream) {
                this.send(this.op.error('state overwrite from a downstream'));
                this.done();
                return;
            }
            this.processState(diff_op);
            ack_vv.add(diff_op.stamp());
        break;
        default:

            // FIXME asynchronous

            this.processOp(diff_op);
            ack_vv.add(diff_op.stamp());
        }
    }

    // remember upstream acknowledgements
    if (is_source_upstream) {
        var new_avv = new AnchoredVV(this.meta.up_avv);
        new_avv.vv.addAll(this.op.value);
        this.saveMeta('up_avv', new_avv.toString());
    }

    // make a response if needed
    if ( this.op.origin() === this.replica.ssn_id ) { // response to our .on
        this.done();
    } else if ( is_source_upstream ) { // a hint for an upstream .on
        this.sendPatchUpstream();
    } else { // we are the upstream, send back a patch
        this.sendPatchDownstream(ack_vv);
    }

};

// As a downstream, we are responsible for remembering the upstream's
// arrival order and progress. Hence, we compose the patch based on
// our local info.
Request.prototype.sendPatchUpstream = function () {
    var self = this;
    var origin = this.op.origin();
    var avv;
    var avv_key = 'avv*' + origin;
    var pos_key = 'last*' + origin;
    this.meta[avv_key];
    this.meta[pos_key];
    this.replica.loadTail(this.typeid, avv.anchor, function respond (error, ops) {
        var patch = [];
        var continuous = true;
        for(var i=0; i<ops.length; i++) {
            var op = ops[i];
            var stamp = op.stamp();
            if (!avv.vv.covers(stamp)) {
                patch.push(op);
                continuous = false;
            } else if (continuous) {
                avv.anchor = stamp;
                if (avv.vv.get(stamp)<=stamp) { // anchor eats vector
                    avv.vv.remove(stamp); // TODO + args
                }
            }
        }

        if (avv!==self.meta[avv_key]) {
            self.saveMeta(avv_key, avv.toString());
        }
        var patch_op = new Op(self.op.spec, pos_key);
        patch_op.bundle(patch);
        self.send(patch_op);
        self.done();
    });
};

// As an upstream, we send a patch based on the provided position in
// our arrival order. We also add an acknowledgement for the received patch.
Request.prototype.sendPatchDownstream = function (ack_vv) {
    var self = this;
    var pos = self.op.value;
    // TODO format check
    this.replica.loadTail(self.typeid, pos, function respond(err, patch) {
        var patch_op = new Op(self.op.spec, ack_vv.toString(), null, patch);
        self.send(patch_op);
        self.done();
    });
};



Request.prototype.processOff = function () {
    if (this.op.source===this.upstream) {
        "life is difficult; TODO";
    } else {
        var i = this.subscribers.indexOf(this.op.source);
        if (i===-1) {
            this.send(this.op.error('not subscribed'));
        } else {
            this.subscribers.splice(i,1);
            this.send(this.op.response('off'));
        }
    }
};


Request.prototype.processState = function () {
    var pos = this.op.stamp();
    if (this.meta.tip==='0') { // new object
        this.save(this.op);
        this.saveMeta('tip', pos);
        this.saveMeta('state', pos);
        if (this.op.source===this.upstream) {
            this.saveMeta('last', pos);
            this.saveMeta('avv', pos);
        }
    } else {
        console.error('state o/w not impl yet');
    }
};


Request.prototype.processOp = function () {
    var is_new = true, is_error = null, self = this;
    var op = this.op;
    var stamp = op.stamp();
    var origin = op.origin();
    var meta = this.meta;
    // fast path: new op or echo

    // track the upstream's progress and arrival order
    if ( meta.upstream === op.source ) {
        self.saveMeta('last', stamp);
        var avv = new AnchoredVV(self.meta.up_avv);
        avv.vv.add(stamp);
        self.saveMeta('up_avv', avv.toString());
    }

    // deal with our arrival order
    if ( stamp > meta.tip ) { // fast track
        self.saveMeta('tip', stamp);
        self.done();
    } else if ( stamp === meta.tip ) { // replay/echo
        is_new = false;
        self.done();
    } else { // need a replay check

        // adjust tip
        var tip = meta.tip.split('!');
        while (tip.length && tip[tip.length-1]<stamp) {
            tip.pop();
        }
        tip.push(stamp);
        var new_tip = tip.join('!');
        // TODO big reordered patch (long offline) => n^2 reads
        // use tip to skip scans
        self.replica.scanTail(self.typeid, stamp, logCheck, respond);
    }

    function logCheck (stored_op) {
        var stored_stamp = stored_op.stamp();
        if (stored_stamp===stamp) { // replay/echo
            is_new = false;
        } else if (stored_stamp>stamp && stored_op.origin()===origin) {
            is_error = "causality violation";
        }
    }

    function respond () {
        if (is_error) {
            self.send(op.error(is_error));
        } else if (is_new) {
            self.saveMeta('tip', new_tip);
            for(var i=0; i<self.subscribers.length; i++) {
                self.send(op, self.subscribers[i]);
            }
            if (op.source!==self.upstream) {
                self.send(op, self.upstream);
            }
            self.save(op);
        }
        self.done();
    }

};
