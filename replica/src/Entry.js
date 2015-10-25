"use strict";
var stamp = require('swarm-stamp');
var AnchoredVV = stamp.AnchoredVV;
var VVector = stamp.VVector;
var sync = require('swarm-syncable');
var Op = sync.Op;
var Spec = sync.Spec;
var Lamp = stamp.LamportTimestamp;

// a single syncable
// subscribers, state metadata
function EntryState (string) {
    this.subscribers = [];
    // The last stamp received from upstream
    this.last = '0';
    this.tip = this.avv = this.state = null;
    var m;
    if (string) {
        while (m=EntryState.reKeyVal.exec(string)) {
            switch (m[1]) {
            case 'l': this.last = m[2]; break;
            case 's': this.state = m[2]; break;
            case 'a': this.avv = m[2]; break;
            case 't': this.tip = m[2]; break;
            }
        }
    }
    // AVV for our arrival order: anchor is max_stamp, vv is reorders (if any)
    if (this.tip === null) {
        this.tip = this.last;
    }
    // our recentmost state (a single stamp)
    if (this.state === null) {
        this.state = this.tip;
    }
    // AVV for ops we receive from the upstream, relative to our order
    if (this.avv === null) {
        this.avv = this.last;
    }
    // other stuff, e.g. non-upstream bookmarks
    this.other = null;
}
EntryState.reKeyVal = /(\w):(\S+)/g;

// serialize the state
EntryState.prototype.toString = function () {
    var str = 'l:'+this.last;
    // avv defaults to last
    if (this.avv!==this.last) {
        str += ' a:' + this.avv;
    }
    // tip defaults to last
    if (this.tip!==this.last) {
        str += ' t:' + this.tip;
    }
    // state defaults to tip
    if (this.state!==this.tip) {
        str += ' s:' + this.state;
    }
    return str;
};

// while an op is being processed
function Entry (replica, typeid, state, ops) {
    this.replica = replica;
    this.typeId = new Spec.Parsed(typeid);
    this.typeid = typeid;
    this.state = state || null;
    // the in-progress op
    this.op = null;
    // queued ops
    this.pending_ops = ops || [];
    // cache of db records (some tail)
    this.records = [];
    // the tail staring position (inclusive?)
    this.tail_start_key = '~';
    // ops to be saved/sent
    this.save_queue = [];
    this.send_queue = [];
    this.mark = '~';
}
Entry.State = EntryState;
module.exports = Entry;


Entry.prototype.prependStoredRecords= function (records) {
    var typeId = this.typeId;
    // parse into ops  (use scopes)
    var ops = records.map( function(rec){
        var key=rec.key, stamp_pos = key.lastIndexOf('!');
        if (stamp_pos>0) { // skip tip_stack if any
            key = key.substr(stamp_pos);
        }
        var spec = new Spec.Parsed(key, typeId);
        return new Op(spec, rec.value, null);
    });
    this.records = ops.concat(this.records);
};


Entry.prototype.appendNewRecord = function () {
    this.records.push(this.op);
    var stamp = this.op.stamp();
    if (stamp>this.state.tip) { // fast path
        this.state.tip = stamp;
    } else { // prepend reordered op keys to ensure arrival order
        var tip_stack = this.state.tip.split('!');
        while (tip_stack.length && tip_stack[tip_stack.length-1]<stamp) {
            tip_stack.pop();
        }
        tip_stack.push(stamp);
        this.state.tip = tip_stack.join('!');
    }
    this.save_queue.push({
        type: 'put',
        key:  '!' + this.state.tip + '.' + this.op.name(),
        value:this.op.value
    });
};


Entry.prototype.queueOps = function (new_ops) {
    if (this.pending_ops===null) {
        this.pending_ops = new_ops.slice();
        if (this.state) {
            this.next();
        }
    } else { // there are some ops in flight
        this.pending_ops = this.pending_ops.concat(new_ops);
    }
};


Entry.prototype.setMeta = function (meta) {
    this.state = meta;
    this.next();
};


Entry.prototype.next = function () {
    if (this.pending_ops.length) {
        this.op = this.pending_ops.shift();
        this.process();
    } else {
        this.pending_ops = null;
        this.save_queue.push({
            type: 'put',
            key:  '.meta',
            value: this.state.toString()
        });
        this.replica.done(this);
    }
};


Entry.prototype.loadMoreData = function (mark) {
    if (this.save_queue.length || this.send_queue.length) {
        console.error('some i/o was made before loadMoreData() call');
    }
    this.pending_ops.unshift(this.op);
    this.op = null;
    this.replica.loadTail(this, mark);
};


Entry.prototype.send = function (op, to_ssn) {
    var to = to_ssn || this.op.source;
    if (op.source!==to) {
        op = op.relay(to);
    }
    this.send_queue.push(op);
};


Entry.prototype.relay = function (except) { // FIXME saveAndRelay
    var subs = this.state.subscribers;
    for(var i=0; i<subs.length; i++) {
        if (!except || subs[i]!==except) {
            this.send(this.op, subs[i]);
        }
    }
};


Entry.prototype.upstream = function () {
    return this.replica.upstream_ssn;
};
Entry.prototype.ssn_id = function () {
    return this.replica.ssn_id;
};


Entry.prototype.process = function () {
    //var is_source_upstream = this.current.source === this.upstream();
    var op = this.op;
    switch (op.name()) {
    case 'on':      if (op.origin()===this.ssn_id()) {
                        this.processReciprocalOn();
                    } else {
                        this.processOn();
                    }
                    break;
    case 'off':     this.processOff(); break;
    case '~state':  this.processState(this.op); break;
    default:        this.processOp(this.op); break;
    }
};


Entry.prototype.processReciprocalOn = function () {
    var op = this.op;
    if (op.source !== this.replica.upstream_ssn) {
        console.error('something fishy is going on');
    }
    // remember everything the upstream sent or acknowledged to us
    var new_avv = new AnchoredVV(this.state.avv);
    new_avv.vv.addAll(this.op.value);
    var patch = this.op.patch;
    if (patch){
        for(var i=0; i<patch.length; i++) {
            new_avv.vv.add(patch[i].stamp());
        }
    }
    this.state.avv = new_avv.toString();

    // upstream .on needs no response
    this.next(); // FIXME call stack length => change to return LATER
};


// As an upstream, we send a patch based on the provided position in
// our arrival order. We also add an acknowledgement for the received patch.
Entry.prototype.processOn = function () {
    var upstream = this.upstream();
    var op = this.op;
    var subs = this.state.subscribers;
    var stateful = '0'!==this.state.state;
    // subscribe to the uplink
    var patch_up, patch_down;

    if (subs.length===0 && upstream) {
        patch_up = this.patchUpstream();
        if (patch_up===LATER) { return; }
    }

    if (stateful) {
        patch_down = this.patchDownstream();
        if (patch_down===LATER) { return; }
    } else {
        patch_down = this.op.reply('on', '');
    }

    if (patch_up) {
        this.send( patch_up, upstream );
        if (subs.indexOf(upstream)===-1) {
            subs.push(upstream);
        }
    }

    if (patch_down) {
        this.send( patch_down, op.source );
        if (patch_down.name()==='on' && subs.indexOf(op.source)===-1) {
            subs.push(op.source);
        }
    }

    this.next();
};
var LATER=null;

// As a downstream, we are responsible for remembering the upstream's
// arrival order and progress. Hence, we compose the patch based on
// our local info.
Entry.prototype.patchUpstream = function () {

    var avv = new AnchoredVV(this.state.avv);
    var anchor = avv.anchor, add_state = false;

    if (anchor==='0') {
        anchor = this.state.state;
        add_state = true;
    }

    if (this.mark>anchor) {
        this.loadMoreData(anchor);
        return LATER;
    }

    var patch = this.makePatch(anchor, null, add_state);

    var ops = this.records;
    var i=0;

    while (i<ops.length && ops[i].stamp()!==anchor) { i++; }
    while (i<ops.length) {
        var op = ops[i++];
        if (op.name()==='~state') { continue; }
        var stamp = op.stamp();
        if (!avv.vv.covers(stamp)) {
            break;
        }
        avv.anchor = stamp;
        if (avv.vv.get(stamp)<=stamp) { // anchor eats vector
            avv.vv.remove(stamp);
        }
    }

    // correctness of this write does not depend on the current op
    // so we'll do it even if patchDownstream says LATER
    this.state.avv = avv.toString();

    var patch_op = new Op(
        this.op.spec.typeId().setStamp(this.replica.upstream_stamp).setOp('on'),
        this.state.last,
        '',
        patch
    );
    return patch_op;
};

// As an upstream, we send a patch based on the provided position in
// our arrival order. We also add an acknowledgement for the received patch.
Entry.prototype.patchDownstream = function () {
    var pos = this.op.value||'0', add_state = false;
    if (!Lamp.is(pos)) {
        return this.op.error('malformed bookmark');
    }

    if (pos>this.state.tip) {
        return this.op.error('bookmark is ahead!');
    }

    var ack_vv = new VVector();
    if (this.op.patch) {
        this.op.patch.forEach(function(o){
            ack_vv.add(o.stamp());
        });
    }

    if (pos==='0') { // the client has nothing
        // this.state.state is defined as we are stateful
        pos =  this.state.state;
        add_state = ack_vv.isEmpty() || !ack_vv.covers(pos);
        // don't send them back their own state
    }

    if ( pos < this.mark ) {
        this.loadMoreData(pos);
        return LATER;
    }


    var patch = this.makePatch(pos, ack_vv, add_state);

    if (patch===null && pos!==this.state.state) {
        // can not figure out the bookmark, send back a full state
        patch = this.makePatch(this.state.state, null, true);
    }

    if (patch===null) {
        return this.op.error('can not produce a patch');
    } else {
        return new Op(
            this.op.spec, ack_vv.toString(), null, patch
        );
    }

};


Entry.prototype.makePatch = function (base, filter, add_state) {
    var i=0;
    var ops = this.records;
    var patch = [];
    while (i<ops.length && ops[i].stamp()!==base) { i++; }
    if (i===ops.length) {
        //return this.op.error('position not found');
        console.error('position not found');
        return null;
    } else if (ops[i].name()!=='~state') {
        i++; // base is known to the peer, hence not included
    }
    if (add_state) {
        if (i<ops.length && ops[i].name()==='~state') {
            patch.push(ops[i]);
            i++;
        } else {
            console.error('cannot find state', base);
            return null;
        }
    }
    while (i<ops.length) {
        var next = ops[i++];
        if (next.name()==='~state') { continue; }
        if (filter && filter.covers(next.stamp())) { continue; }
        patch.push(next);
    }
    return patch;
};


Entry.prototype.processOff = function () {
    if (this.op.source===this.upstream) {
        "life is difficult; TODO";
    } else {
        var i = this.state.subscribers.indexOf(this.op.source);
        if (i===-1) {
            this.send(this.op.error('not subscribed'));
        } else {
            this.state.subscribers.splice(i,1);
            this.send(this.op.reply('off'));
        }
    }
    this.next();
};


Entry.prototype.processState = function () {
    var pos = this.op.stamp();
    if (this.state.tip!=='0' && this.op.source!==this.upstream()) {
        this.send(this.op.error('state overwrite from a downstream'));
    } else if (this.state.tip==='0') { // new object
        this.appendNewRecord();
        this.state.state = pos;
        if (this.op.source===this.upstream()) {
            this.state.last = pos;
            this.state.avv = pos;
        }
        this.relay(this.op.source);
        this.mark = pos;
    } else if (this.op.source===this.upstream()) {
        // check conditions are perfect (==tip, no compound)
        var avv = new AnchoredVV(this.state.avv);
        var patch = this.makePatch(avv.anchor, avv.vv);
        if (!patch.length) {
            // the upstream has acknowledged everything we know, so
            // this state eats everything we have => may append it
            this.appendNewRecord();
            this.state.state = this.op.stamp();
            this.relay(this.upstream());
        } else {
            console.warn('have unacked ops; upstream state skipped');
        }
    } else {
        this.send(this.op.error('state o/w impossible'));
    }
    this.next();
};


Entry.prototype.processOp = function () {
    var is_known = false, is_error = null;
    var op = this.op;
    var stamp = op.stamp();
    var origin = op.origin();
    var state = this.state;
    var upstream = this.upstream();

    // deal with our arrival order
    if ( stamp > state.tip ) { // fast track: new op
        is_known = false;
    } else if ( stamp === state.tip ) { // fast track: replay/echo
        is_known = true;
    } else { // need a replay check
        // IMPORTANT: no i/o before this check
        if (this.mark>stamp) {
            // TODO use tip stack to skip scans
            return this.loadMoreData(stamp);
        }
        is_known = this.records.some(function (o) {
            var stored_stamp = o.stamp();
            if (stored_stamp>stamp && o.origin()===origin) {
                is_error = "causality violation";
                return true;
            }
            return stored_stamp===stamp; // FIXME replay/echo
        });
    }

    if (is_error) {
        this.send(this.op.error(is_error));
        this.next();
        return;
    }

    // track the upstream's progress and arrival order
    if (upstream === op.source ) {
        this.state.last = stamp;
        var avv = new AnchoredVV(this.state.avv);
        avv.vv.add(stamp);
        this.state.avv = avv.toString();
    }

    if (!is_known) {
        this.relay(op.source===upstream?upstream:undefined);
        this.appendNewRecord();
    } else if (op.source!==upstream) {
        this.send(op, op.source); // ack it, just in case
    } else {
        // upstream ack it is
    }

    this.next();

};
