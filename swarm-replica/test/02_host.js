"use strict";
var Swarm = require('..');
var Replica = Swarm.Replica;
var Host = Swarm.Host;
var Model = Swarm.Model;

var levelup = require('levelup');
var memdown = require('memdown');

var bat = require('swarm-bat');
Host.multihost = true;

var tape = require('tap').test;


tape ('replica.02.A simple Model sync', function(t){
    var db = levelup('replica/02/A', { db: memdown });
    var replica = new Replica({
        ssn_id: 'user',
        db_id: 'db',
        empty_db:   true,
        db:    db
    });
    var host1 = new Host({
        ssn_id: 'user~ssn1',
        db_id: 'db'
    });
    var host2 = new Host({
        ssn_id: 'user~ssn2',
        db_id: 'db'
    });

    //replica.addStreamDown(host1);
    //replica.addStreamDown(host2);
    //replica.onDownstreamHandshake(host1.handshake(), host1);
    //replica.onDownstreamHandshake(host2.handshake(), host2);
    replica.addOpStreamDown(host1);
    replica.addOpStreamDown(host2);

    var obj1 = new Model({a:1}, host1);
    var obj2 = host2.get(obj1.spec());
    obj1.on('change', function (ev) {
        t.equal(obj1.a, 2);
        t.end();
    });
    obj2.onInit(function(){
        t.equal(obj2.a, 1);
        obj2.set({a:2});
    });
});
