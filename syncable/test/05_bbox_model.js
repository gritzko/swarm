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
    comment: 'upstream handshake, subscriptions initiated (i)',
    query:   '',
    response:'/Swarm+Host#db!00000+me~5C.on\t\n\n'+
             '#Alice+herself\t\n\n#Bob+himself\t\n\n'
},
{
    comment: 'upstream handshake, subscriptions initiated (ii)',
    query:   '/Swarm+Replica#db!timeup+swarm.on\t\n\n',
    response:''
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

    os.pipe(host);
    host.pipe(os);

    var bob = host.get('/Model#Bob+himself');

    bt.run ( checkCarol );
    //host.replaySubscriptions();

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

var DESC_STATE = [
{
    comment: 'upstream handshake, subscriptions initiated',
    query:   '/Swarm+Replica#db!timeup+swarm.on\t\n\n',
    response:'/Swarm+Host#db!00000+me~5E\t\n\n'+
             '#Alice+herself\t\n\n#Bob+himself\t\n\n'
},
{
    comment: 'host subscribes to an object',
    query:   '',
    response:'#object 0\n\n'
},
{
    comment: 'the state arrives, host makes a change',
    query:   '#object\t\n\n\t!time+remote.~state\t{"x":1}\n',
    response:'#object!00001+me~5E.set\t{"y":1}\n'
},
{
    comment: 'descending state arrives',
    query:   '!time+remote.~state\t{"x":2}\n',
    response:''
},
{
    comment: 'change ack arrives, host makes another change',
    query:   '#object!00001+me~5E.set\t{"y":1}\n',
    response:'#object!00002+me~5E.set\t{"z":3}\n'
}
];

tape.skip('5.E descending state', function (t) {

    var host = new Host({
        db_id: 'db',
        ssn_id: 'me~5E',
        clock: new stamp.LamportClock('me~5C')
    });

    var obj = host.get('object', function () {
        obj.set({y:1});
        t.equal(this.y, 1);
        obj.on('change', function() {
            obj.set({z:3});
        });
    });

    var bt = new bat.StreamTest(host, DESC_STATE, t.equal.bind(t));
    bt.run(function(){
        t.deepEqual(obj, {x:2, y:1, z:3});
        t.end();
    });

});


var SNAPSHOTS = [
{
    comment: 'handshake (I)',
    query:   '',
    response:'/Swarm+Host#db!00000+me~5F.on\t\n\n'
},
{
    comment: 'handshake (II)',
    query:   '/Swarm+Replica#db!time+swarm.on\tme~5F\n\n',
    response:''
},
{
    comment: 'upstream sends a taily state, host responds with a snapshot',
    query:   '#object\toriginal+author\n'+
             '\t!original+author.~state\t{"original+author":{"default":"value"}}\n'+
             '\t!version+author.set\t{"update":true}\n\n',
    response:'#object\toriginal+author\n\n'+
             '#object!version+author.~state\t{"original+author":{"default":"value"},"version+author":{"update":true}}\n'
},
{
    comment: 'a follow-up op, Host responds with a snapshot',
    query:   '#object!zup+author.set\t{"update":42}\n',
    response:'#object!zup+author.~state\t{"original+author":{"default":"value"},"zup+author":{"update":42}}\n'
},
{
    comment: 'unsubscription',
    query:   '#object.off\t\n',
    response:'#object.off\t\n'
}
];


tape('5.F snapshotting', function (t) {

    var host = new Host({
        db_id: 'db',
        ssn_id: 'me~5F',
        clock: new stamp.LamportClock('me~5F'),
        snapshot: 'immediate',
        api:    false
    });

    var bs = new bat.BatStream();
    var os = new OpStream(bs.pair);

    var bt = new bat.StreamTest(bs, SNAPSHOTS, t.equal.bind(t));

    os.pipe(host);
    host.pipe(os);

    bt.run(function(){
        t.equal('/Model#object' in host.crdts, false, 'no state remaining');
        t.equal(host.syncables, null, 'no API');
        // t.notOk(host.syncables); // TODO CRDT only
        t.end();
    });

});


tape.skip('5.G exception handling', function (t) {

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
