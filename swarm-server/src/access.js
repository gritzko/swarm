"use strict";
const fs = require('fs');
const leveldown = require('leveldown');
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const peer = require('swarm-peer');
const Spec = swarm.Spec;
const Stamp = swarm.Stamp;


function access (home, args, done) {

    let level = new leveldown(home);

    let db = new peer.LevelOp(level, null, err => {
        if (err) {
            done(err);
        } else {

            let erase_prefix = args.e || args.erase;
            if (erase_prefix)
                db.eraseAll(erase_prefix, done);

            let scan_prefix = args.s || args.scan;
            if (scan_prefix) {
                let from, till;
                if (scan_prefix===true) {
                    from = new Spec();
                    till = new Spec([Stamp.ERROR, Stamp.ERROR, Stamp.ERROR, Stamp.ERROR]);
                } else {

                }
                db.scan(
                    from,
                    till,
                    op=>console.log(op.toString()),
                    done
                );
            }

            let put_ops = args.p || args.put;
            if (put_ops) {
                let frame = fs.readFileSync(put_ops);
                let ops = swarm.Op.parseFrame(frame);
                if (!ops)
                    done('syntax error'); // TODO line etc
                db.save(ops, done);
            }

            // TODO -g get, -O -0 edit options

        }
    });

}


module.exports = access;