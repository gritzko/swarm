"use strict";
var Swarm = require('swarm-replica');
var leveldown = require('leveldown');
var fs = require('fs');

function fork (args, done) {

    var fork_db;

    var role = 'Client', gen_mark = 'C';
    if (args.ring || args.o) {
        role = 'Ring';
        gen_mark = 'R';
    } else if (args.slave || args['1']) {
        role = 'Slave';
        gen_mark = 's';
    } else if (args.shard || args['2']) {
        role = 'Shard';
        gen_mark = 'S';
    }

    /* parse options first
    var opt_keys = Object.keys(args).filter(function(o){
        // FIXME syntax
        return o.length>1 && o.charAt(0)==='D'; //FIXME
    });
    var options = opt_keys.map(function(k){
        return new Swarm.Op('!0.'+k.substr(1), args[k]);
    });*/

    /*if (fs.existsSync(args.home+'/LOCK')) { FIXME
        return done('no fork for a running instance');
    }*/
    args.fork = args.fork || args.f;

    var cpr = require('cpr');
    var orig_db, fork_db;

    if (fs.existsSync(args.fork)) {
        return done('destination already exists');
    }

    cpr(args.home, args.fork, {
        deleteFirst: false,
        overwrite: true,
        confirm: true
    }, function(err, files) {
        if (err) {
            done('copy error: '+err);
        } else {
            orig_db = leveldown(args.home);
            fork_db = leveldown(args.fork);
            orig_db.open({}, function(err){
                if (err) {
                    return done(err);
                }
                fork_db.open({}, function(err){
                    if (err) {
                        return done(err);
                    }
                    orig_db.get('.on', rewrite_hs);
                });
            });
        }
    });

    var fork_generation;

    function rewrite_hs (err, hs_str) {
        if (err) {
            return done(err);
        }
        var hs = Swarm.Op.parse(hs_str.toString()).ops[0];
        var options = Object.create(null);
        var orig_generation = '';
        fork_generation = orig_generation + gen_mark;
        // 1. invoke Policy directly
        // 2. mark the generation  Generation:  SsCR
        var fork_options = null;

        var fork_spec = '/'+role+'+Swarm#0!0.on';
        var fork_hs_op = new Swarm.Op(fork_spec, fork_options, null, []);
        args.v && console.warn('fork db init with:', fork_hs_op.toString());
        fork_db.put('.on', fork_hs_op.toString(), load_replicas);
    }

    var orig, fork;
    var lops = new Swarm.LocalOpSource();

    function load_replicas () {
        args.v && console.warn('load both replicas...');
        orig = new Swarm.Replica(orig_db, {
            onReady: load_fork,
            onFail:  done
        });
        function load_fork () {
            orig.addDownstreamSource(lops.pair);
            fork = new Swarm.Replica(fork_db, {
                onReady: finalize,
                onFail:  done,
                upstream: lops
            });
        }
    }

    function finalize () {
        args.v && console.warn('done, close it...');
        fork.close(function(err){
            args.v && console.warn('fork closed');
            if (err) {
                done(err);
            } else {
                orig.close(done);
            }
        });
    }

}

module.exports = fork;
