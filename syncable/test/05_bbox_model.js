"use strict";
var stamp = require('swarm-stamp');
var sync = require('..');
var Op = sync.Op;
var Model = sync.Model;
var Host = sync.Host;
var bat = require('swarm-bat');

Host.multihost = true;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}


tape('4.A Model set/get - Host protocol', function (t) {
    t.plan(6);
    var host = new Host({
        ssn_id: 'anon~4A',
        db_id: 'db',
        clock: new stamp.LamportClock('anon~4A')
    });
    var collect = '';
    var stream = new bat.BatStream();
    host.setUpstream(stream);
    stream.pair.on('data', function(op){
        collect += op.toString();
    });
    var m = new Model({x:1}, host);
    t.equal(m.x, 1, 'constructor arg value');
    m.set({y:2});
    t.equal(m.x, 1, 'x=1 is still there');
    t.equal(m.y, 2, '.set works');
    m.set({x:3});
    t.equal(m.x, 3);
    t.equal(m.y, 2);
    stream.pair.on('end', function() {
        t.equal(collect,
            '/Swarm+Host#db!00000+anon~4A.on\t\n\n' +
            '#00001+anon~4A\t0\n' +
                '\t!00001+anon~4A.~state\t{"00001+anon~4A":{"x":1}}\n\n' +
            '#00001+anon~4A!00002+anon~4A.set\t{"y":2}\n' +
            '#00001+anon~4A!00003+anon~4A.set\t{"x":3}\n',
            'full upstream output'
        );
        t.end();
    });
    stream.end();
});

tape('4.B concurrent ops', function (t) {
    t.plan(1);
    var host = new Host({
        ssn_id: 'anon~4B'
    });
    var duckling = new Model({}, host);
    host.write( new Op(
            duckling.spec()+'!1time+user2.set',
            '{"height":"2cm"}',
            host.id ));
    host.write( new Op(
            duckling.spec()+'!0time+user1.set',
            '{"height":"3cm"}',
            host.id ));
    t.equal(duckling.height.toString(), '2cm');
});
