'use strict';
var Swarm = require('swarm-syncable');
var util = require('util');
var OpSource = Swarm.OpSource;
var Op = Swarm.Op;
var LogMeta = require('./LogMeta');
var Lamp = Swarm.LamportTimestamp;

/**
 *  LevelDB based storage
 *
 *  Stores ops and state snapshots.
 *  Responds to subscription requests with patches.
 *  Emits every new op that needs to be broadcasted (source=0).
 *  Also, emits every response op (source=recipient).
 *  Uses LevelDown as its underlying interface.
 *
 *  *Correctness strategy*
 *
 *  The math underlying the protocol assumes causality preservation.
 *  Practically that means we should not reorder ops -- at least,
 *  same object's ops. Order preservation is built into the
 *  protocol itself; otherwise, we'll need to use more of version
 *  vectors, which are expensive and complex.
 *
 *  The worst and potentially irrecoverable lapse is to relay
 *  operation that is not reliably saved yet. Other replicas will
 *  imply we know the op, while we may forget it.
 *  Hence, all emits are done after all the saves:
 *  writeOp in --> (saved to DB) --> emitOp out
 *
 *  *Performance strategy*
 *
 *  Orthogonality: parallelism is only achieved by running
 *  more LevelOpSources over the same db. LevelOpSource does
 *  no smart batching, ops are processed one by one.
 *  The load is divided between LevelOpSources according to
 *  an id-hashing scheme.
 *  @class
 */
function LevelOpSource (leveldown_db, options) {
    OpSource.call(this, options);
    this.db = leveldown_db; // LevelDown
    this.prefix = options.prefix || '';
    // single-liners describing object's log states (see LogState.js)
    this.meta = Object.create(null); // {typeid: state_str}
    this.in_queue = [];
    this.emit_queue = [];
    this.save_queue = [];
    this.idle = true;
    this.upstream_source = null;
    this.done = setImmediate.bind(this.next.bind(this));
    // TODO this.next = setImmediate()
    this.readDbHandshake();

}
util.inherits(LevelOpSource, OpSource);
module.exports = LevelOpSource;
LevelOpSource.debug = false;

//    O P S O U R C E   I N T E R F A C E


LevelOpSource.prototype._writeOp = function (op) {
    //this.queue.offer(op);
    this.in_queue.unshift(op);
    if (this.idle) {
        this.next();
    }
};


/**
 * LevelOpSource plays a passive role here: we trust our Replica
 */
LevelOpSource.prototype._writeHandshake = function (hs) {
    this.source_id = hs.origin()+'~lvl';
    this.db.put('.on', hs.toString(), function () {
        LevelOpSource.debug && console.warn('HS_SAVE', hs.toString());
    });
};



LevelOpSource.prototype._writeEnd = function () {
    // emits the .off back once all processing is finished
    this.queue.offer(new Op('.off', ''));
};


//   L I F E C Y C L E


LevelOpSource.prototype.next = function () {
    var self = this;
    self.idle = false;
    var op = self.in_queue.pop(); //self.queue.poll();
    console.error('next', op.toString());
    var typeid = op.typeid();

    // load state if needed
    if (op.spec.Type().origin()==='Swarm') {
        return this.processOuterHandshake(op, do_send);
    } else {
        var cached_meta = self.meta[typeid], meta;
        if (!cached_meta) {
            this.readMeta(typeid, do_process);
            //self.queue.push_back(upscribe); upscribe is commanded by
            //Replica
        } else {
            do_process(cached_meta);
        }
    }

    function do_process (meta_str) {
        console.warn('do_process');
        meta = new LogMeta(meta_str);
        self.process(op, meta, do_save);
    }

    // process() -> save() -> send() -> next()
    function do_save (error) {
        console.warn('do_save');
        if (error) {
            // FIXME empty queues
            self.queueEmit([op.spec.set('.error'), error]);
        } else {
            self.flushRecords(op, meta, do_send);
        }
    }

    function do_send () {
        console.warn('do_send');
        self.emitAll(op, meta);
        if (self.in_queue.length) {
            setImmediate(self.next.bind(self));
        } else {
            self.idle = true;
        }
    }
};
// local snapshots are not emitted
// var sends = this.save_queue.filter(function(o){
//     return  op.name()!=='~state' || op.stamp()===state.base;
// });
// sends.forEach( self.emitOp.bind(self) );


//    O U T P U T   M E T H O D S


LevelOpSource.prototype.appendNewOp = function (op, meta) {
    var stamp = op.stamp();
    if (stamp>meta.tip) { // fast path
        meta.tip = stamp;
    } else { // prepend reordered op keys to ensure arrival order
        var stack = meta.tip.split('!');
        while (stack.length && stack[stack.length-1]<stamp) {
            stack.pop();
        }
        stack.push(stamp);
        meta.tip = stack.join('!');
    }
    this.save_queue.push({
        type:  'put',
        key:   '!' + meta.tip + '.' + op.name(),
        value: op.value
    });
    this.queueEmit(op.triplet());
};


LevelOpSource.prototype.flushRecords = function (op, meta, done) {
    var typeid = op.typeid();
    var key_prefix = this.prefix + typeid;
    var save = this.save_queue;
    this.save_queue = [];
    save.forEach(function(rec){
        rec.key = key_prefix + rec.key;
        if (!rec.value) { // level-js workaround
            rec.value = ' ';
        }
    });
    var meta_str = meta.toString();
    if (meta_str!==this.meta[typeid]) {
        save.push({
            type: 'put',
            key:   key_prefix + '.~meta',
            value: meta_str
        });
    }
    LevelOpSource.debug && console.warn('SAVE', JSON.stringify(save));
    this.db.batch(save, done);
};

LevelOpSource.prototype.queueEmit = function (triplet) {
    this.emit_queue.push(triplet);
};

LevelOpSource.prototype.emitAll = function (op, meta) {
    for(var i=0; i<this.emit_queue.length; i++) {
        var o = this.emit_queue[i];
        this.emitOp(o[0], o[1], o.length>2?o[2]:null);
        //if (o.name()!=='~state' || o.stamp()===meta.base) {
        //} TODO snapshots
    }
    this.emit_queue.length = 0;
};


//    L O G I C S   &   P R O T O C O L


LevelOpSource.prototype.process = function (op, meta, done) {
    switch (op.name()) {
    case 'on':      if (op.stamp()===this.upstream_source) {
                        this.processReciprocalOn(op, meta, done);
                    } else if (op.origin()===null) {
                        this.processUpscribe(op, meta, done);
                    } else {
                        this.processOn(op, meta, done);
                    }
                    break;
    case 'off':     if (op.spec=='.off') {
                        this.processEnd(op, meta, done);
                    } else {
                        this.processOff(op, meta, done);
                    }
                    break;
    case '~state':  this.processState(op, meta, done); break;
    default:        this.processOp(op, meta, done); break;
    }
};


//    L O G I C S


LevelOpSource.prototype.processEnd = function (op, state, done) {
    this.emitEnd();
    done();
};

LevelOpSource.prototype.processOuterHandshake = function (op, done) {
    // TODO
    LevelOpSource.debug && console.warn('OUTER HS', op.toString());
    this.queueEmit(op.triplet());
    done();
};

/**
 * As an upstream, we send a patch based on the provided position in
 * our arrival order. We also add acknowledgements for the received patch.
 */
LevelOpSource.prototype.processOn = function (op, meta, done) {
    var self = this;
    var stateful = '0'!==meta.tip; // FIXME the default must be 0
    var bookmark = op.value || '0';
    // check for obvious errors first
    if (!Lamp.is(bookmark)) {
        return done('malformed bookmark');
    }
    if (bookmark>meta.tip) {
        return done('bookmark is ahead!');
    }
    // make an acknowledgement for incoming ops
    var ack_vv = new Swarm.VVector();
    console.warn('op', op.toString());
    if (op.patch) {
        op.patch.forEach(function(o){
            ack_vv.add(o.stamp());
        });
        this.processPatch(op.patch, meta, do_response);
    } else {
        do_response();
    }


    function do_response () {

        var re_patch = [];
        self.queueEmit([op.spec, ack_vv.toString(), re_patch]);
        // we still can modify re_patch

        if (!stateful) { // we have nothing
            /* THINK TWICE
            var dstream_has_no_state = bookmark==='0';
            var no_upstream = self.source_id==='swarm' &&
                (!upstream || self.op.source===upstream); // ? TODO shaky
            if (dstream_has_no_state && no_upstream) {
                var zero_state = new Op(self.op.typeid()+'!0.~state', '');
                self.appendNewOp(zero_state, meta);
                re_patch.push(zero_state);
            }
            */
            done();
        } else if (bookmark==='0') { // the client has nothing

            meta.tip!=='0' &&
            self.readTail(meta.base+'.~state', function (o) {
                if (o.name()!=='~state' || o.stamp()===meta.base) {
                    re_patch.push(o);
                }
            }, done);

        } else if (bookmark===meta.tip) { // no new ops yet

            //self.queueEmit([op.spec, ack_vv.toString()]);
            done();

        } else { // OK, we likely have something to send

            self.readTail(bookmark, function (o) {
                // check for bm-not-found
                re_patch.push(o);
            }, function(err) {
                done(err); // 'bookmark not found' TODO full st
            });

        }
    }
};

/**
 *      .on received fro the upstream
 * */
LevelOpSource.prototype.processReciprocalOn = function (op, state, done) {
    // remember everything the upstream sent or acknowledged to us
    var new_avv = new AnchoredVV(this.state.avv);
    if (AnchoredVV.is(op.value)) {
        new_avv.vv.addAll(op.value);
    }
    if (op.patch){
        op.patch.forEach(function(o){
            new_avv.vv.add(o.stamp());
        });
    }
    this.state.avv = new_avv.toString();

    if (op.patch) {
        self.processPatch(op.patch, meta, done);
    } else {
        done();
    }

};

/** hint to send an .on to the upstream */
LevelOpSource.prototype.processUpscribeOn = function (op, meta, done) {

    this.upstream = op.stamp();

    var avv = new AnchoredVV(this.state.avv);
    var anchor = avv.anchor, add_state = false;

    var patch_op = new Op(
        // ?! .setStamp(this.replica.upstream_stamp)
        this.op.spec.typeId().setOp('on'),
        this.state.last,
        '',
        patch
    );
    self.queueEmit(patch_op.triplet());

    if (anchor==='0') {
        anchor = this.state.base;
        add_state = true;
    }

    this.readTail( start, function (o) {
        if (o.name()==='~state') {

        }
        patch.push(o);
        // compact upstream state tracking vvec
        if (!covers) { return; }
        if (!avv.vv.covers(stamp)) {
            covers = false;
        }
        mata.u_anchor = stamp;
        if (meta.vv.get(stamp)<=stamp) { // anchor eats vector
            meta.vv.remove(stamp);
        }
    }, done);

};

LevelOpSource.prototype.processOp = function (op, meta, done) {
    var stamp = op.stamp();
    if ( this.upstream === op.source ) { // track the upstream
        meta.last = stamp;
        meta.vv.add(stamp);
    }
    if (stamp>meta.tip) {
        this.appendNewOp(op, meta);
        done();
    } else if (stamp===meta.tip) {// fast track: replay/echo
        done();
    } else {
        this.stampsSeen(op.typeId, stamp, function(vv){
            if (!vv.covers(stamp)) {
                this.appendNewOp(op, meta);
            }
            done();
        });
    }
};

/**
 *  Process incoming operations: check whether we have them already,
 *  save and emit if not.
 */
LevelOpSource.prototype.processPatch = function (ops, meta, done) {
    if (!meta.base) {
        return done('no base state');
    }
    var self = this, typeid = ops[0].typeid();
    // track the upstream's progress and arrival order
    if ( this.upstream === ops[0].source ) {
        meta.last = ops[ops.length-1].stamp();
        ops.forEach(function(o){
            meta.vv.add(o.stamp());
        });
    }
    // find the min timestamp
    var min_stamp = '~';
    ops.forEach(function(o){
        if (o.stamp() < min_stamp) {
            min_stamp = o.stamp();
        }
    });
    // cases
    if ( min_stamp > meta.tip ) { // fast track: new ops
        do_add_new();
    } else { // still needs a replay check
        this.stampsSeen(typeid, min_stamp, function (seen_vv){
            ops = ops.filter(function(o){
                return !seen_vv.covers(o.stamp());
            });
            do_add_new();
        });
    }

    function do_add_new () {
        ops.forEach(function(o){
            self.appendNewOp(o, meta);
        });
        done();
    }

};

/**
 *  An incoming state snapshot can be one of:
 *
 *  * (downstream/upstream) state for a new object,
 *  * (upstream) descending state (the log is too long),
 *  * (local) state snapshot for local use - same as desc state.
 */
LevelOpSource.prototype.processState = function (op, meta, done) {
    var self = this;
    if ( meta.tip && op.source!==this.upstream ) {
        done('state overwrite from a downstream');
    } else if ( ! meta.tip ) {
        this.appendNewOp(op, meta);
        meta.base = op.stamp();
        if (op.source===this.upstream) {
            meta.anchor = meta.last = op.stamp();
        }
        done();
    } else if (op.source===this.upstream) {

        // FIXME upstream state echo

        // check conditions are perfect (==tip, no compound)
        var unacked = false;
        this.readTail(meta.anchor, function(o) {
            unacked |= !meta.vv.covers(o.stamp());
        }, function on_unackd_check () {
            if (unacked) {
                done('have unacked ops; upstream state skipped');
                return;
            }
            // the upstream has acknowledged everything we know, so
            // this state eats everything we have => we can make it
            // our new base
            self.appendNewOp(op, meta);
            meta.base = op.stamp();
            done();
        });
    } else {
        done('state o/w impossible');
    }
};



//    D B   R E A D   R O U T I N E S


LevelOpSource.isNFE = function (err) {
    return err && (
        /NotFound/.test(err.message) ||
        err.notFound ||
        err.name==='NotFoundError'
    );
};


LevelOpSource.prototype.readDbHandshake = function () {
    var self = this;
    this.db.get( this.prefix+'.on', {asBuffer: false}, function (err, hs_str) {
        if (err && !LevelOpSource.isNFE(err)) {
            self.emitEnd(err);
            return;
        }
        if (err) {
            self.emitHandshake('/Swarm#0!0.on', '', []);
        } else {
            var ops = Op.parse(hs_str+'\n');
            if (!ops || ops.ops.length!==1) {
                self.emitEnd('invalid stored handshake');
            } else {
                var hs = ops.ops[0];
                self.emitHandshake(hs.spec, hs.value, hs.patch);
            }
        }
    });
};


LevelOpSource.prototype.readMeta = function (typeid, done) {
    var self = this;
    // for shortcut conns: /Type#id!~+peer.meta
    var key = this.prefix + typeid + '!~.meta';
    this.db.get(key, function (err, value){
        if (err && !LevelOpSource.isNFE(err)) {
            console.error('meta read failed', key, err);
            self.writeEnd(err);
        } else {
            LevelOpSource.trace && console.log('META', key, value);
            done(value);
        }
    });
};


LevelOpSource.prototype.stampsSeen = function (typeid, since, done) {
    var seen = new Swarm.VVector();
    this.readTail(typeid, '!'+since, function scan_for_overlaps(o) {
        if (o) {
            seen.add(o.stamp());
        } else {
            done(seen);
        }
    });
};


LevelOpSource.prototype.readTail = function (typeid, mark, callback) {
    // first, wait for the write to finish?
    if (this.batch.length) {
        this.flushNewOps(start_read);
    } else {
        start_read();
    }
    var ops = [];
    function start_read() {
        iterator;
        var more = iterator.next.bind(iterator, record_in);
        function record_in (error, key, value) {
            if (error) {
                over (error);
            } else if (key) {
                setImmediate(more);
            } else {
                iterator.end();
                over();
            }
        }
    }
    function over( error ){
        callback(error, ops);
    }
};
