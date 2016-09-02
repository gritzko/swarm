"use strict";
const fs = require('fs');
const path = require('path');
const leveldown = require('leveldown');
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const peer = require('swarm-peer');
const Swarm = sync.Swarm;

let db, dbname, replid;

function create (home, args, done) {

    dbname = args.n || args.name;
    replid = args.i || args.id;

    // understand db name / replica id / path
    if (dbname||replid) {

        if (!swarm.Base64x64.is(dbname))
            return done('malformed db name');
        if (!swarm.Base64x64.is(replid))
            return done('malformed replica id');
        dbname = dbname || 'test';
        replid = replid || '1';
        home = home + '/' + dbname + '-' + replid;

    } else { // parse the path

        let basename = path.basename(home);
        let stamp = new swarm.Stamp(basename);
        if (stamp.isError())
            return done('invalid dir name pattern');
        dbname = stamp.value;
        replid = stamp.origin;

    }

    // understand the id scheme
    let scheme = Swarm.DEFAULT_REPLICA_ID_SCHEME;
    if (args.oIdScheme)
        scheme = Swarm.parseReplicaIdScheme(args.oIdScheme);

    if (!scheme)
        return done('malformed id scheme');
    if (scheme.primuses)
        return done('primuses are not supported yet');
    if (replid.length!==scheme.peers)
        return done('peer id length does not match the scheme');

    // let's read the options
    let opts_obj = Object.create(null);
    let options = new sync.Swarm();
    options._clock = new swarm.Clock(replid, opts_obj);
    options.set(opts_obj);

    Object.keys(args).
        filter(key=>key[0]==='o').
        filter(key=>swarm.Base64x64.is(key.substr(1))).
        forEach(
            key => options.set(key.substr(1), args[key])
        );
    //console.log(options, args);
    options._id = new swarm.Stamp(dbname, '0'); //options._clock.issueTimestamp()

    // OK, let's create things
    if (!fs.existsSync(home)) {
        fs.mkdirSync(home);
    }

    let level = leveldown(home);

    db = new peer.LevelOp (level, {errorIfExists: true}, err => {

        if (err)
            return done(err);

        db.putAll ([options.toOp()], err => {
            if (err)
                done(err);
            else
                db.close(done);
        });

    });

}


module.exports = create;
