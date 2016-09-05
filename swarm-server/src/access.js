"use strict";
const fs = require('fs');
const leveldown = require('leveldown');
const swarm = require('swarm-protocol');
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
            let put_file = args.p || args.put;
            let scan_prefix = args.s || args.scan;

            if (erase_prefix)
                erase(db, erase_prefix, done);

            if (put_file)
                put(db, put_file, done);

            if (scan_prefix || !(put_file || erase_prefix))
                scan(db, scan_prefix||true, done);


            // TODO -g get, -O -0 edit options

        }
    });

}

function erase (db, prefix, done) {
    db.eraseAll(prefix, done);
}

function scan (db, prefix, done) {
    let from, till;
    if (prefix===true) {
        from = new Spec();
        till = new Spec([Stamp.ERROR, Stamp.ERROR, Stamp.ERROR, Stamp.ERROR]);
    } else {
        from = new Spec(prefix);
        till = null;
    }
    db.scan(
        from,
        till,
        op=>console.log(op.toString()),
        done
    );
}

function put (db, file, done) {
    let frame = fs.readFileSync(file);
    let ops = swarm.Op.parseFrame(frame);
    if (!ops)
        done('syntax error'); // TODO line etc
    db.save(ops, done);
}


module.exports = access;