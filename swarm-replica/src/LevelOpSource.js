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
    this.ending = false;
    this.upstream_source = null;
    this.done = setImmediate.bind(this.next.bind(this));
    this.seen_cache = null;
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
    this.repl_id = hs.origin();
    this.source_id = hs.origin()+'~lvl';
    this.db.put('.on', hs.toString(), function () {
        LevelOpSource.debug && console.warn('HS_SAVE', hs.toString());
    });
};



LevelOpSource.prototype._writeEnd = function (off) {
    // emits the .off back once all processing is finished
    this.ending = true;
    if (this.idle) {
        this.closeDatabase();
    }
};

LevelOpSource.prototype.closeDatabase = function () {
    var self = this;
    this.db.close(function(err){
        self.emitEnd(err);
    });
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
        meta = new LogMeta(meta_str);
        self.process(op, meta, do_save);
    }

    // process() -> save() -> send() -> next()
    function do_save (error) {
        if (error) {
            // FIXME empty queues
            self.queueEmit([op.spec.set('.off'), error]);
            do_next();
        } else {
            self.flushRecords(op, meta, do_send);
        }
    }

    function do_send () {
        self.emitAll(op, meta);
        do_next();
    }

    function do_next () {
        if (self.in_queue.length) {
            setImmediate(self.next.bind(self));
        } else {
            self.idle = true;
            if (self.ending) {
                self.closeDatabase();
            }
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
    if (this.hs.spec.type()==='Root+Swarm') {
       meta.anchor = meta.last = stamp; // me is the upstream
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
        LevelOpSource.debug && console.warn('META', meta_str);
        save.push({
            type: 'put',
            key:   key_prefix + '.~meta',
            value: meta_str
        });
        this.meta[typeid] = meta_str;
    }
    LevelOpSource.debug && console.warn('SAVE',
        save.map(function(e){return e.key;}).join(' '));
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
    if (op.origin()===this.hs.origin()) { // upstream hs
        LevelOpSource.debug && console.warn('UPSTREAM HS', op.toString());
        this.upstream_source = op.stamp();
    } else {
        LevelOpSource.debug && console.warn('OUTER HS', op.toString());
        this.queueEmit(op.triplet());
    }
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


    function do_response (err) {
        if (err) {
            return done(err);
        }
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
    if ( this.upstream_source === op.source ) { // track the upstream
        meta.last = stamp;
        meta.vv.add(stamp);
    }
    if (stamp>meta.tip) {
        this.appendNewOp(op, meta);
        done();
    } else if (stamp===meta.tip) {// fast track: replay/echo
        done();
    } else {
        var self = this;
        this.stampsSeen(op.typeId, stamp, function(vv){
            if (!vv.covers(stamp)) {
                self.appendNewOp(op, meta);
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
    LevelOpSource.debug && console.warn('PATCH OF', ops.length);
    var i = 0, self = this, causal_vv = new Swarm.VVector();
    if (ops.length && ops[i].name()==='~state') {
        causal_vv.add(ops[i].stamp());
        this.processState(ops[i++], meta, next);
    } else {
        next();
    }
    function next () {
        if (i===ops.length) {
            done();
        } else if (causal_vv.covers(ops[i].stamp())) {
            LevelOpSource.debug && console.warn('CAUSAL FAIL', ops[i]);
            done('causality violation');
        } else if (ops[i].name()!=='~state') {
            causal_vv.add(ops[i].stamp());
            self.processOp(ops[i++], meta, next);
        } else {
            done('misplaced state snapshot');
        }
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
    LevelOpSource.debug && console.warn('STATE', op.spec.toString());
    var stamp = op.stamp();
    if ( meta.tip==='0' ) {
        this.appendNewOp(op, meta);
        meta.base = stamp;
        if (op.source===this.upstream_source) {
            meta.anchor = meta.last = stamp;
        }
        done();
    } else if ( op.spec.origin()===this.repl_id ) { // snapshot
        if (meta.tip===stamp) { // no preemptive ops
            this.appendNewOp(op, meta);
            meta.base = stamp;
        }
        done();
    } else if (op.source===this.upstream_source) {
        if (stamp<=meta.base) { //upstream state echo
            meta.vv.add(stamp);
            done();
        } else {
            /* check conditions are perfect (==tip, no compound)
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
            });*/
            done('state descend is not implemented yet');
        }
    } else {
        done('can not accept state snapshot');
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
    var cache = this.cache_cache;
    if (cache) {
        if (cache.typeid===typeid && cache<=since) {
            return done(cache.seen);
        }
    }
    var seen = new Swarm.VVector();
    this.readTail(typeid, '!'+since, function (err, o) {
        if (o) {
            seen.add(o.stamp());
        } else {
            this.seen_cache = {
                typeid: typeid,
                since: since,
                seen: seen
            };
            done(seen);
        }
    });
};


LevelOpSource.prototype.readTail = function (typeid, mark, on_entry) {
    var i = this.db.iterator({
        gte : typeid + mark,
        lt  : typeid + '!~'
    });
    i.next(read_loop);
    var next_bound = i.next.bind(i, read_loop);

    function read_loop (err, key, val) {
        if (err) {
            console.error(err);
            on_entry(err, null);
        } else if (key) {
            on_entry(null, new Op(key, val, '(lvl)'));
            //i.next(read_loop);
            setImmediate(next_bound);
        } else {
            i.end(on_entry);
        }
    }
};
