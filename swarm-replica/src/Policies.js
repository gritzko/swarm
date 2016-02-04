'use strict';
var Replica = require('./Replica');
var Swarm = require('swarm-syncable');
var Lamp = Swarm.LamportTimestamp;

/** new conn policy: assign new replica ids sequentially */
Replica.HS_POLICIES.SeqReplicaIdPolicy = function SRIP (in_hs, out_hs, opsrc, done) {
    if (in_hs.stamp()!='0') {
        return done();
    }
    var count = this.options.ForkCount || '0';
    var count_int = Swarm.base64.base2int(count);
    var new_count = Swarm.base64.int2base(count_int+1, 1);
    this.options.ForkCount = new_count;
    var stamp = this.clock.issueTimestamp();
    out_hs[0]= out_hs[0].set(stamp.time()+'+'+new_count, '!');
    out_hs[2].push(['!0.Clock', this.options.Clock]); // FIXME better place for this
    // FIXME why !0 ???
    this.saveHandshake();
    done();
};

Replica.HS_POLICIES.MyDownstreamPolicy = function (in_hs, out_hs, opsrc, done) {
    // if (op.origin()===this.repl_id) {
    // } else
    done();
};

/** naive auth policy: give simple hash secrets to new replicas */
// FIXME move to swarm-server
var crypto = require('crypto');
Replica.HS_POLICIES.HashSecretPolicy = function HSP (in_hs, out_hs, opsrc, done) {
    var master_secret = this.options.MasterSecret;
    if (!master_secret) {
        this.saveHandshake();
    }
    var hash = crypto.createHash('sha256');
    hash.update(master_secret);
    hash.update(out_hs.origin());
    var secret = hash.digest('base64');
    if (in_hs.stamp()=='0') { // tell the hash
        if (out_hs.stamp()=='0') {
            return done('no replica id (HashSecretPolicy)');
        }
        out_hs.patch.push(new Swarm.Op('!0.Secret', secret));
        done();
    } else { // check the hash
        var ds_secret = in_hs.patch.filter(function(o){
            return o.name()==='Secret';
        });
        if (ds_secret.length && ds_secret[0].value===secret) {
            done();
        } else {
            done('no secret or wrong secret');
        }
    }
};

Replica.OP_POLICIES.SubtreeOriginAccessPolicy = function SOAP (op, op_stream, done) {
    if (op_stream.is_upstream) {
        return done();
    }
    var origin = new Lamp(op.origin());
    var source = op_stream.hs.origin();
    if (origin.isInSubtree(source)) {
        done();
    } else {
        done('invalid op origin '+origin);
    }
};
