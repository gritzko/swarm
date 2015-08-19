"use strict";
var sync = require('..');
var Op = sync.Op;
var Model = sync.Model;
var Host = sync.Host;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}


tape('4.A set/get', function (t) {
    var host = new Host('anon~4A', null);
    var m = new Model({x:1}, host);
    t.equal(m.x, 1);
    m.set({y:2});
    t.equal(m.x, 1);
    t.equal(m.y, 2);
    m.set({x:3});
    t.equal(m.x, 3);
    t.equal(m.y, 2);
    t.end();
});

tape('4.B concurrent ops', function (t) {
    var host = new Host('anon~4B', null);
    var duckling = new Model({}, host);
    host.deliver( new Op(
            duckling.spec()+'!1time+user2.set',
            '{"height":"2cm"}',
            host.id ));
    host.deliver( new Op(
            duckling.spec()+'!0time+user1.set',
            '{"height":"3cm"}',
            host.id ));
    t.equal(duckling.height.toString(), '2cm');
    t.end();
});
