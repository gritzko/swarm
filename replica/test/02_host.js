"use strict";
var stamp = require('swarm-stamp');
var sync = require('swarm-syncable');
var Replica = require('..');
var Host = sync.Host;
var Model = sync.Model;

var bat = require('swarm-bat');
Host.multihost = true;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}


tape ('2.A simple Model sync', function(t){
    var replica = new Replica({
        ssn_id: 'user',
        db_id: 'db'
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
    replica.onDownstreamHandshake(host1.handshake(), host1);
    replica.onDownstreamHandshake(host2.handshake(), host2);

    var obj1 = new Model({a:1}, host1);
    var obj2 = host2.get(obj1.spec());
    obj1.on('change', function () {
        t.equal(obj1.a, 2);
        t.end();
    });
    obj2.onInit(function(){
        t.equal(obj2.a, 1);
        obj2.set({a:2});
    });
});
