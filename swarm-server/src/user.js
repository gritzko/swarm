"use strict";
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const LevelDOWN = require('leveldown');
const swarm = require('swarm-protocol');
const peer = require('swarm-peer');
const Spec = swarm.Spec;
const Stamp = swarm.Stamp;
const ReplicaId = swarm.ReplicaId;
const ReplicaIdScheme = swarm.ReplicaIdScheme;
const Base64x64 = swarm.Base64x64;
const Auth = require('./AuthOpStream');

// /~Client#0login!timestamp+R.passwd  SHA-256(0login+' '+password)
// /~Client#0login!timestart+R.ssn+RloginSSN  // session init
// /~Client#0login!timestamp+R.login+RloginSSN // login record

function users (home, args, done) { // FIXME parse in cli.js

    let level = new LevelDOWN(home);
    let basename = path.basename(home);
    if (!Stamp.is(basename))
        return done("can not parse db name/replica id");
    const replica = new Stamp(basename);

    let db = new peer.SwarmDB(replica, level, null, err => {
        if (err) {
            done(err);
        } else {

            let add = args.a || args.add;
            let remove = args.r || args.remove;
            let list = args.l || args.list;

            if (add)
                add_user(db, args, done);
            if (remove)
                remove_user(db, args, done);
            if (list)
                list_users(db, args, done);

        }
    });


}

module.exports = users;

function add_user (db, args, done) {
    const login = args.a || args.add;
    if (!Base64x64.is(login))
        return done('login must be Base64x64');
    if (login.length>db.scheme.partLength(ReplicaIdScheme.CLIENT))
        return done('too long for the replica id scheme '+db.scheme);
    const client = Base64x64.rightShift(login,
        db.scheme.partOffset(ReplicaIdScheme.CLIENT));

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question(login + ' password: ', (password) => {
        const add_salt = crypto.createHash('sha256');
        // TODO  stdio cycle
        add_salt.update(client);
        add_salt.update(' ');
        add_salt.update(password);
        const salted_hash = add_salt.digest('base64');
        const op = new swarm.Op( new Spec([
            Auth.CLIENT_CLASS,
            client,
            db.now(),
            Auth.METHOD_PASSWORD
        ]), salted_hash );
        rl.close();
        db.put(op, done);
    });

}

// FIXME big issue: these ops don't go into VV!!!

function remove_user (db, args, done) {
    const login = args.r || args.remove;
    if (!Base64x64.is(login))
        return done('login must be Base64x64');
    if (login.length>db.scheme.partLength(ReplicaIdScheme.CLIENT))
        return done('too long for the replica id scheme '+db.scheme);
    const client = Base64x64.rightShift(login,
        db.scheme.partOffset(ReplicaIdScheme.CLIENT));
    const op = new swarm.Op( new Spec([
        Auth.CLIENT_CLASS,
        client,
        db.now(), // FIXME origin
        Auth.METHOD_PASSWORD
    ]), '(blocked)' );
    db.put(op, done);

}

function list_users (db, args, done) {
    const from = new Spec([Auth.CLIENT_CLASS,Stamp.ZERO,Stamp.ZERO,Stamp.ZERO]);
    const till = new Spec([Auth.CLIENT_CLASS,Stamp.NEVER,Stamp.NEVER,Stamp.NEVER]);
    const offset = db.scheme.partOffset(ReplicaIdScheme.CLIENT);
    let user = '';
    let status = '';
    db.scan( from, till,
        o=> {
            let new_user = Base64x64.leftShift(o.spec.Id.value, offset);
            if (user!==new_user)
                console.log(user, status);
            user = new_user;
            status = o.value==='(blocked)' ? 'BLOCKED' : 'ACTIVE';
        },
        err => {
            console.log(user, status);
            done(err);
        },
        {
            filter: o => o.spec.method === Auth.METHOD_PASSWORD
        }
    );
}