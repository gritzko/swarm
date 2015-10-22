"use strict";
var stamp = require('swarm-stamp');
var sync = require('..');
var Op = sync.Op;
var Model = sync.Model;
var OpStream = sync.OpStream;
var Host = sync.Host;
var bat = require('swarm-bat');

Host.multihost = true;

var tape = require('tape');
if (typeof(window)==='object') {
    var tape_dom = require('tape-dom');
    tape_dom.installCSS();
    tape_dom.stream(tape);
}


tape('5.A Model set/get - Host protocol', function (t) {
    t.plan(6);
    var host = new Host({
        ssn_id: 'anon~5A',
        db_id: 'db',
        clock: new stamp.LamportClock('anon~5A')
    });
    var collect = '';
    host.on('data', function(op){
        collect += op.toString();
    });
    host.replaySubscriptions();
    var m = new Model({x:1}, host);
    t.equal(m.x, 1, 'constructor arg value');
    m.set({y:2});
    t.equal(m.x, 1, 'x=1 is still there');
    t.equal(m.y, 2, '.set works');
    m.set({x:3});
    t.equal(m.x, 3);
    t.equal(m.y, 2);
    host.on('end', function() {
        t.equal(collect,
            '/Swarm+Host#db!00000+anon~5A.on\t\n\n' +
            '/Model#00001+anon~5A.on\t0\n' +
                '\t!00001+anon~5A.~state\t{"00001+anon~5A":{"x":1}}\n\n' +
            '/Model#00001+anon~5A!00002+anon~5A.set\t{"y":2}\n' +
            '/Model#00001+anon~5A!00003+anon~5A.set\t{"x":3}\n',
            'full upstream output'
        );
        t.end();
    });
    host.end();
});


tape('5.B concurrent ops', function (t) {
    t.plan(1);
    var host = new Host({
        ssn_id: 'anon~5B'
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


var REFS = [
{
    comment: 'upstream handshake, subscriptions initiated',
    query:   '/Swarm+Replica#db!timeup+swarm.on\t\n\n',
    response:'/Swarm+Host#db!00000+me~5C\t\n\n'+
             '#Alice+herself\t\n\n#Bob+himself\t\n\n'
},
{
    comment: 'state arrives (Bob has a link to Alice)',
    query:   '#Alice+herself\t\n'+
                '\t!time0+herself.~state\t'+
                    '{"time0+herself":{"name":"Alice"}}\n\n'+
             '#Bob+himself\t\n'+
                '\t!time0+himself.~state\t'+
                    '{"time0+himself":{"name":"Bob","prev":{"ref":"#Alice+herself"}}}\n\n',
    response:''
},
{
    comment: 'Alice gets a link to Bob',
    query:   '#Alice+herself!time1+herself.set\t{"next":{"ref":"#Bob+himself"}}\n',
    response:'#Alice+herself!00001+me~5C.set\t{"me":{"ref":"/Model#Alice+herself"}}\n'
},
/*{
    comment: 'a link added through API',
    query:   '',
    response:'#Alice+herself!00002+anon~5C.set\t{"me":{"ref":"#Alice+herself"}}\n'
},*/
{
    comment: 'echo - silence',
    query:   '#Alice+herself!00002+anon~5C.set\t{"me":{"ref":"#Alice+herself"}}\n',
    response:''
},
{
    comment: 'Bob gets a ref to Carol (auto - subscription)',
    query:   '#Bob+himself!time2+himself.set\t{"next":{"ref":"#Carol+herself"}}\n',
    response:'#Carol+herself\t\n\n'
},
{
    comment: 'Carol state arrives',
    query:   '#Carol+herself\t\n'+
                '\t!time3+herself.~state\t{"time3+herself":{'+
                   '"name":"Carol",'+
                   '"prev":{"ref":"#Bob+himself"}'+
                '}}\n\n',
    response:''
}
// TODO unlisten Bob, gc Carol
];


tape('5.C refs - blackbox', function (t) {

    var host = new Host({
        db_id: 'db',
        ssn_id: 'me~5C',
        clock: new stamp.LamportClock('me~5C')
    });

    var bs = new bat.BatStream();
    var os = new OpStream(bs.pair);

    var bt = new bat.StreamTest(bs, REFS, t.equal.bind(t));

    // create syncables
    var alice = host.get('/Model#Alice+herself');
    var bob = host.get('/Model#Bob+himself');

    os.pipe(host);
    host.pipe(os);

    bt.runScenario( checkCarol );
    host.replaySubscriptions();

    bob.onInit(function () {
        t.equal(bob.prev, alice, 'onInit - link OK');
        t.equal(bob.prev.name, "Alice");
    });

    alice.once('change', function () {
        t.equal(alice.name, "Alice");
        t.equal(alice.next, bob, 'on change - link to an existing object');
        t.ok(alice.next.hasState());
        t.equal(alice.next.name, 'Bob');
        alice.set({me: alice}, 'API - set reference');
        t.equal(alice.me, alice, 'circular link OK');
    });

    bob.once('change', function () {
        t.equal(bob.next._id, 'Carol+herself', 'Bob got Carol');
        t.equal(bob.next.isStateful(), false);
        t.equal(alice.next.next._id, 'Carol+herself');
    });

    function checkCarol () {
        t.equal(bob.next._id, 'Carol+herself', 'check Carol');
        t.equal(bob.next.isStateful(), true);
        t.equal(bob.next.name, 'Carol');
        t.equal(bob.next.prev, bob);

        t.ok(!host.unacked_ops['/Model#Alice+herself'], 'no pending');
        t.end();
    }


});



var TORTURE_MODELS = [
{
    comment: 'push-on',
    query:   '/Model#id!stamp.on\t\n',
    response:'/Model#id!stamp.on\t\n'
},
{
    comment: 'state+tail = state\'',
    query:   '/Model#id!stamp.diff\n'+
                '\t!old00.state\t{"old00":{"x":"1"}}\n'+
                '\t!old01.set\t{"y":"2"}\n\n',
    response:'/Model#id!stamp.diff\n'+
                '\t!old01.state\t{"old00":{"x":"1"},"old01:"{"y":"2"}}\n'
}, // FIXME Model inner state, not outer
{
    comment: 'a new op races into the gap; snapshot update',
    query:   '/Model#id!old02.set\t{"z":"3"}\n',
    response:'/Model#id!old02.state\t{"old00":{"x":"1"},"old01:"{"y":"2"},"old02:"{"z":"3"}}\n'
},
{
    comment: 'off',
    query:   '/Model#id!stamp.off\t\n',
    response:'/Model#id!stamp.off\t\n'
},
{
    comment: 'further ops are ignored',
    query:   '/Model#id!old03.set\t{"x":"2"}\n',
    response:''
}
];

//   OUTER  <--new state-- INNER <--ops---  HOST <--remote-- STORE
//          --api call-->        --submit->      --new op-->
//  echo policy: last_stamp
// storage has no idea who the consumers are, so it echoes every
// new op => echo is OK, types must be idempotent, we may kill
// echos for better performance
tape.skip('5.D tortures', function (t){
    var host = new Host({
        ssn_id: 'me',
        db_id:  'db',
        clock:  new stamp.TestClock('me'),
        pushOn: true,
        emitStates: true
    });
    var host_stream = host.stream();

    var bt = new StreamTest(host_stream, TORTURE_MODELS, t.equal.bind(t));

    bt.runScenario( function () {
        t.end();
    } );

});


tape.skip('5.E host reconnections', function (t) {

    // FIXME resync, buffer local changes

});


tape.skip('5.F exception handling', function (t) {

    // FIXME resync, buffer local changes

});


/*tape('5.E misc - dave/diff', function (t) {
    var host = new Host({
        db_id: 'db5D',
        ssn_id: 'anon~5E',
        upstream: 'loopback:5E'
    });
    var replica = new bat.BatServer('loopback:5E');

    replica.on('connection', function (stream) {

        var bt = new bat.StreamTest(stream, REFS, checkCarol);
        bt.runScenario( t.end.bind(t) );
        // create syncables
        var alice = host.get('/Model#Alice+herself');

    });
});*/
