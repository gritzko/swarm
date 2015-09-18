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


tape('4.A set/get', function (t) {
    t.plan(5);
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
    t.equal(m.x, 1);
    m.set({y:2});
    t.equal(m.x, 1);
    t.equal(m.y, 2);
    m.set({x:3});
    t.equal(m.x, 3);
    t.equal(m.y, 2);
    stream.pair.on('end', function() {
        t.equal(collect,
            '/Swarm+Host#db!STAMP+anon~4A.on\t\n' +
            '/Model#00000+anon~4A!00000+anon~4A.state\t\n' +
            '/Model#00000+anon~4A!STAMP+anon~4A.on\t???\n' +
            '/Model#00000+anon~4A!00001+anon~4A.set' +
                '\t{}' +
            '/Model#00000+anon~4A!00001+anon~4A.set' +
                '\t{}'
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
    host.deliver( new Op(
            duckling.spec()+'!1time+user2.set',
            '{"height":"2cm"}',
            host.id ));
    host.deliver( new Op(
            duckling.spec()+'!0time+user1.set',
            '{"height":"3cm"}',
            host.id ));
    t.equal(duckling.height.toString(), '2cm');
});
