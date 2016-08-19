"use strict";
var Swarm = require('../');
var OpQueue = Swarm.OpQueue;
var Op = Swarm.Op;
var tape = require('tap').test;

tape ('syncable.07.A OpQueue basic API', function(t){
    var queue = new OpQueue(2);
    var on = new Swarm.Spec('.on');
    var op1 = new Op(on, 1);
    var op2 = new Op(on, 2);
    var op3 = new Op(on, 3);
    t.equal(queue.offer(op1), true, 'has space');
    t.equal(queue.offer(op2), false, 'reached limit');
    t.equal(queue.offer(op3), false, 'over limit');
    t.equal(queue.poll().value, '1', '1');
    t.equal(queue.at(0).value, '2');
    t.equal(queue.at(1).value, '3');
    t.equal(queue.poll().value, '2', '2');
    t.equal(queue.at(0).value, '3');
    t.equal(queue.poll().value, '3', '3');
    t.end();
});


tape ('syncable.07.A 1mln ops', function(t){
    var LENGTH = 1000000;
    var queue = new OpQueue(LENGTH);
    var on = new Swarm.Spec('.on');
    for(var i=0; i<LENGTH; i++) {
        queue.offer(new Op(on, i));
    }
    t.equal(queue.length(), LENGTH);
    var match = true;
    for(i=0; i<LENGTH; i++) {
        match |= (queue.poll().value==i);
    }
    t.ok(match);
    t.end();
});
