"use strict";
const fs = require('fs');
const path = require('path');
const leveldown = require('leveldown');
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const peer = require('swarm-peer');
const Swarm = sync.Swarm;
const ReplicaIdScheme  = swarm.ReplicaIdScheme;

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
    const scheme_opt = args['o'+ReplicaIdScheme.DB_OPTION_NAME];
    let scheme =  new ReplicaIdScheme(scheme_opt);
    if (!scheme)
        return done('malformed id scheme');
    if (scheme.primuses)
        return done('primuses are not supported yet');
    if (replid.length!==scheme.peers)
        return done('peer id length does not match the scheme ('+scheme.peers+')');

    // let's read the options
    let opts = Object.create(null);
    Object.keys(args).
    filter(key=>key[0]==='o').
    map(key=>key.substr(1)).
    filter(opt=>swarm.Base64x64.is(opt) && opt!=ReplicaIdScheme.DB_OPTION_NAME).
    forEach(
        opt => opts[opt] = args['o'+opt]
    );
    opts[ReplicaIdScheme.DB_OPTION_NAME] = scheme.toString(); // FIXME timestamp !~
    let options = new sync.Swarm();
    options._clock = new swarm.Clock(replid, opts);
    options.setAll(opts);
    options._id = new swarm.Stamp(dbname, '0'); //options._clock.issueTimestamp()

    let state = options.toOp(); //.restamped(clock.issueTimestamp());

    // OK, let's create things
    if (!fs.existsSync(home)) {
        fs.mkdirSync(home);
    }

    let level = leveldown(home);

    db = new peer.LevelOp (level, {errorIfExists: true}, err => {

        if (err)
            return done(err);

        const stamp = state.spec.Stamp;

        db.putAll ([state], err => {
            if (err)
                done(err);
            else
                level.put('+'+stamp.origin, stamp.value, err=>db.close(done));
        });

    });

}


module.exports = create;
