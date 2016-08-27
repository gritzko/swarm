"use strict";
const fs = require('fs');
const path = require('path');
const leveldown = require('leveldown');
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const peer = require('swarm-peer');
const Swarm = sync.Swarm;
const cpr = require('cpr');

function fork (home, args, done) {

    let basename = path.basename(home);
    let stamp = new swarm.Stamp(basename);
    if (stamp.isError())
        return done('invalid dir name pattern');
    let dbname = stamp.value;
    let replid = stamp.origin;

    let new_path = args.t || args.to || '.';

    let new_replid = args.i || args.id;

    if (!new_replid) {

        if (new_path==='.')
            return done('no replica id specified');
        let basename = path.basename(new_path);
        let stamp = new swarm.Stamp(basename);
        if (stamp.isError())
            return done('invalid dir name pattern');
        if (stamp.value!==dbname)
            return done("database names don't match");
        new_replid = stamp.origin;
        if (new_replid.length!==replid.length)
            return done('replica id does not match the scheme?');

    } else {

        new_path += '/' + dbname + '+' + new_replid;

    }

    if (fs.existsSync(new_path)) {
        return done('destination already exists: '+new_path);
    }

    cpr(home, new_path, {
        deleteFirst: false,
        overwrite: true,
        confirm: true
    }, function(err, files) {
        if (err) {
            done('copy error: '+err);
        } else {
            let level = leveldown(new_path);
            let db = new peer.LevelOp (level, null, err => {

                if (err)
                    return done(err);
                else done();

                // TODO rewrite options, rescope the state (??!)

            });        }
    });

}

module.exports = fork;

