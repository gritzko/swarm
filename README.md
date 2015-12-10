# Swarm 1.x.x
_reactive data sync: replicated model for your web/mobile app_

__proceed with caution: 1.0 is not entirely stable!__
[![BuildStatus](https://travis-ci.org/gritzko/swarm.svg?branch=master)](https://travis-ci.org/gritzko/swarm)

Swarm is a sync-centric data storage with an object-based interface.
Simply put, once you change an object at one replica, that change propagates to other object's replicas in real time.
Concurrent changes merge automatically.
Offline replicas re-sync on re-connection.
All data is cached.
Swarm.js is isomorphic and is perfect for implementing synchronization, collaboration or continuity features in Web and [mobile][react-native] apps.

Swarm works for:
* vanilla client-server sync,
* real-time collaboration,
* continuity,
* offline work,
* and other [sync-related scenarios][blog-UDA].

Swarm supports complex CRDT data types by relying on its op-based replica synchronization machinery.
If you understand what [CmRDT][cmrdt] is, then you may [implement][syncable-types] your own data types.
You may run your own [Swarm server][swarm-node].
Free-as-in-freedom (MIT).

![Swarm: deployment](doc/swarm-moscowjs-deployment.png)

## How to start

### Install 

Install an example server:

    npm install swarm-react-node
    ...
    npm start

The default config puts LevelDB files into ./db/ and listens
localhost:8000 for both HTTP and WebSocket connections (see `swarm-react-node --help` for other options).

### Click around

Open `http://localhost:8000`.
You should see the default mouse-sync example.
Open in another tab or browser to experiment.

### Go hardcore

Open console, start playing:

    swarm.host.syncables;
    swarm.host.gc();

## Code examples 


    var sync = require('swarm-syncable');
    var Model = sync.Model;
    var Host = sync.Host;

    // var replica = new Replica({upstream: 'ws://localhost:8000'});
    // a replica manages logs and synchronizes to the upstream replica
    // in this example, we'll create a replica implicitly through Host

    // manages objects
    new Host({
        replica: true,
        upstream: 'ws://localhost:8000'
    });
    var mouse = new swarm.Model({x:1, y:2});
    mouse.on('change', function() {
        console.log('mouse x:', mouse.x, 'y:', mouse.y);
    });
    mouse.set({x:3, y:4});


## How it works

Distributed systems are hard.
Two easy ways to build a distributed system are either:

* to make a system that *mostly* works or
* to shift the difficult part to the API user.

We did our best to avoid both shortcuts.
Swarm's advantage is provably correct bedrock math that works everywhere, all the time, correctly.
Swarm implements the commutative ([CmRDT][cmrdt]) variety of replicated data types.
Those are built on top of partially ordered op logs.
Every op is immutable and has an unique timestamp.
Eventually, all ops reach all the replicas and all the states converge.
As long as you are OK with object-scoped eventual consistency, that is more than enough.
Neither [bookkeeping][pacioli] nor missile guidance systems need any ACID.
Most likely, your case needs no ACID too.

Classic databases (MySQL, Oracle, MongoDB) are built on top of *linear* operation logs.
Their logs are hidden, but the resulting state is exposed and queried.
Stream processing systems (like Kafka) are often described as "inside-out" databases as they expose their logs.
In both cases, the *master* node is the source of truth.
Swarm is built on top of object-scoped *partially* ordered logs (hidden) which mutate the distributed CRDT state (exposed).
Swarm can be described as an "upside-down" database because its [source of truth][SST] is at leaf nodes where ops originate.
This adaptation makes lots of sense for complex web and mobile apps.
Especially if leaf nodes have immediate access to the natural source of truth, be it a sensor or a user.

That makes Swarm [information-centric][infocentric], like git.
Nothing is defined by its place of storage; information hops from a storage to a storage transparently.
There is no master storage.

Those op logs and CRDT data structures are wrapped with an ORM-like API that works in terms of syncable objects.
*Syncables* pretend to be regular plain objects as much as they can.

## Parts

Swarm is a LEGO-like system. It has three types of parts that can form various topologies.
Similar to LEGO blocks, parts get connected by an unified op-based interface, an *op stream*.

An op stream carries three types of messages: subscriptions, state snapshots and CRDT ops per se.
An op stream is asynchronous; the only request-response-like pattern is the subscription handshake.
Once a subscription is open, new ops are relayed automatically.
The default wire protocol is a stream of newline-separated key-value pairs.
Each op has a key which is an unique compound identifier (also named [*specifier*][spec]) and a value.
Op value format depends on the object's CRDT type.
Hence, it is treated as an opaque string by the protocol.

![Swarm LEGO parts](doc/swarm1.0arch.png "Swarm 1.0 LEGO parts")

### Replica

A replica is what the literature calls a "reliable causal broadcast".
Its mission is to deliver every object's op to every object's copy, with no causality violations.
Replicas implement both op storage and op relay *reliably* to correctly resume transmission after any interruptions.
A replica employs some key-value storage engine to save/query its op logs.
Essentially, replicas do the syncing per se.

### Host

A Host is a container for Syncables and CRDT objects.
Normally, those go in pairs: a Syncable is a projection of its CRDT.
A Syncable is the outer part of an object's state, while a CRDT is the inner protected part.
The first step in using Swarm is to create a Host and connect it to some upstream Replica.
Every Host reminds a classic MVC loop where inner CRDT objects are "models", syncables are "views" and the Host itself is a controller.
Events flow as follows:

* An API user interacts with a Syncable,
* which generates ops,
* which propagate to all the object's CRDT replicas (both local and remote),
* which update their Syncables,
* which emit change events to API users.

### Router

In a larger deployment, all the system's load can not fit into a single Replica.
Routers spread the load by implementing consistent hashing, sharding, etc.
Unless something is done wrongly, object-scoped systems have a potential to be [linearly scalable][apple-cassandra].

## Changes from 0.3

It was a year since 0.3 was released.
That was a showcase release for the CRDT technology and it made a splash as such.
The next release was supposed to be 0.4, but that one was never released.
Note that Swarm switches to [Semver][semver]: 1.0.0 is not "1.0".
Formally, 1.0.0 is just the first release that uses the new version of the protocol.

The first and foremost priority of 0.4/1.0.0 is to produce a production-ready *architecture*.
In late 2014, lab tests and flashcrowds (thanks HackerNews) surfaced quite a few bugs and, most importantly, architectural deficiencies.
In particular:

* some data structures suffered of cancerous garbage accumulation (thanks again, HackerNews)
    * version vectors are a pain in the ass, no matter how you sit
    * some objects may have infinite mutation history and that is OK
* 0.3 wire protocol had some efficiency issues
    * per-object three-way handshake is a bit too complex and expensive (esp regarding RTT)
    * 0.3 does not quite prevent op replays (which have to be filtered at the object level, which is expensive)
* finally, 0.3 was not bulletproof mathematically
    * 0.3 [breaks][36] in multi-level configurations (proxy servers, caches, etc -- thanks [Sergey](https://twitter.com/chicoxyzzy))

The system underwent full rehash:

* op/snapshot/handshake interplay was redefined concisely
* the handshake was converted into 2-way
* version vectors are avoided (still used locally in some cases of true consurrency)
* data heavylifting is left to a battle-tested storage engine (LevelDB)

At this point, the code base is fresh, but the architecture and, especially, the protocol, are final and complete.
Hence, 1.0.0.


## Links

* [blog](swarmjs.github.io)
* [twitter](https://twitter.com/swarm_js)
* [github](https://github.com/gritzko/swarm)


[react-native]: https://facebook.github.io/react-native/
[blog-UDA]: http://swarmjs.github.io/articles/uda/
[cmrdt]: https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#Operation-based_CRDTs
[syncable-types]: https://github.com/gritzko/swarm/tree/master/syncable
[swarm-node]: https://github.com/gritzko/swarm/tree/master/node
[pacioli]: https://en.wikipedia.org/wiki/Bookkeeping#/media/File:Pacioli.jpg
[SST]: http://www.truthaboutdeath.com/blog/id/1591/the-authoritative-source-of-truth
[infocentric]: https://en.wikipedia.org/wiki/Information-centric_networking
[spec]: http://swarmjs.github.io/articles/lamport/
[apple-cassandra]: http://www.techrepublic.com/article/apples-secret-nosql-sauce-includes-a-hefty-dose-of-cassandra/
[semver]: http://semver.org/
[36]: https://github.com/gritzko/swarm/issues/36


---------

# Swarm 0.3 (historical)

[Swarm](http://swarmjs.github.io/articles/todomvc/) is an isomorphic reactive M-of-MVC library that synchronizes objects in real-time and may work offline. Swarm is perfect for implementing collaboration or continuity features in Web and mobile apps. Swarm supports complex data types by relying on its op-based CRDT base.

You may run your own Swarm server. If you understand what CRDT is, then you may implement your own data types. Free-as-in-freedom (MIT).


## Installation


`npm install swarm`
or
`git clone https://github.com/gritzko/swarm.git`

## Usage (Code Samples)

see example apps at

* [Swarm+React TodoMVC](https://github.com/gritzko/todomvc-swarm)
* [Swarm Demo3](https://github.com/swarmjs/swarm-example)

these demos are normally online at http://ppyr.us and http://ppyr.us:8001/demo3/index.html respectively.

### Creating your first simple synchronized type

```js
var Swarm = require('swarm');

var Mouse = Swarm.Model.extend('Mouse', {
    defaults: {
        name: 'Mickey',
        x: 0,
        y: 0
    }
});

module.exports = Mouse; // CommonJS
```

### Using the model on the client (app.js)

```js
// 1. create local Host
var swarmHost = new Swarm.Host('unique_client_id');

// 2. connect to your server
swarmHost.connect('ws://localhost:8000/');

// 3.a. create an object
var someMouse = new Mouse();
// OR swarmHost.get('/Mouse');
// OR new Mouse({x:1, y:2});

// 4.a. a locally created object may be touched immediately
someMouse.set({x:1,y:2});

// 3.b. This object is global (we supply a certain id) so we
// may need to wait for its state to arrive from the server
var mickey = new Mouse('Mickey');

// 4.b. ...wait for the state to arrive
mickey.on('init', function () {
    // ...so we may touch it finally.
    mickey.set({x: 3, y: 4});
});

// 5. let's subscribe to the object's change events
mickey.on(function (spec, val, source) {
    // this will be triggered by every state change, be it
    // local or remote
    console.log('event: ', spec.op(), val);
    // outputs:
    // set {x:3, y:4}
});
```

### Creating a simple NodeJS sync server

```js
var http = require('http');

// npm install ws
var ws_lib = require('ws');

// npm install swarm
var Swarm = require('swarm');

var Mouse = require('./Mouse.js'); // see the model definition above

// use file storage
var fileStorage = new Swarm.FileStorage('storage');

// create the server-side Swarm Host
var swarmHost = new Swarm.Host('swarm~nodejs', 0, fileStorage);

// create and start the HTTP server
var httpServer = http.createServer();
httpServer.listen(8000, function (err) {
    if (err) {
        console.warn('Can\'t start server. Error: ', err, err.stack);
        return;
    }
    console.log('Swarm server started at port 8000');
});

// start WebSocket server
var wsServer = new ws_lib.Server({ server: httpServer });

// accept incoming WebSockets connections
wsServer.on('connection', function (ws) {
    console.log('new incoming WebSocket connection');
    swarmHost.accept(new Swarm.EinarosWSStream(ws), { delay: 50 });
});
```

see [swarm-example](https://github.com/swarmjs/swarm-example/blob/master/server.js) for a nice example of a generic model sync server


## Swarm API Quickstart

Key classes:

* **Host** is a container for **CRDT** (Convergent Replicated Data Type) [object replicas](http://swarmjs.github.io/articles/objects-are-event-streams/). **Hosts** interact each other through **Streams** by sending **Operations**. Each **Host** normally has some **Storage** attached.
* An **Operation** (op) is a pair of a **Specifier** (key) and a **Value**. [**Specifier**](http://swarmjs.github.io/articles/lamport/) is unique for each op invocation, contains type name, object id, Lamport timestamp and method (op) name. **Value** is something JSON-serializable, may understand it as parameters to the op/method.
* **Model** is a CRDT type for a simple per-field last-write-wins object.
* **Set** is a type for a set of objects (unordered collection, unique elements).
* **Vector** is a Vector of objects (ordered collection).
* **Text** is a collaboratively editable plain text type (a very simplistic [Causal Trees](http://www.pds.ewi.tudelft.nl/~victor/polo.pdf) implementation)

### Host

[Host](lib/Host.js) is (practically) a user session, and (formally) a partial replica of a dataset.
 Normally, a Host has some Storage and one or more Pipes to other Hosts.

### Streams

Stream wraps a connection to a remote Host.
Streams are mostly used internally. An average developer is supposed to simply use URIs.

Streams has a standard NodeJS-compatible Stream interface:

- method `send` (sends text message to remote),
- events:

    - `data` (on receiving message from remote),
    - `close` (on stream closed),
    - `error` (when some error happened).

`Swarm.env.streams` maps protocol name to Stream interface implementation.

Several Stream implementations are included in SwarmJS library:

* [WebSocketStream](lib/WebSocketStream.js) – client-side WebSocket wrapper.

* [EinarosWSStream](lib/EinarosWSStream.js) – server-side WebSocket wrapper, see: [einaros/ws](https://github.com/einaros/ws).

* [SockJSStream](lib/SockJSStream.js) – client-side SockJS socket wrapper.

* [SockJSServerStream](lib/SockJSServerStream.js) – server-side SockJS socket wrapper.

* [PostMessageStream](lib/PostMessageStream.js) – uses window.postMessage API for streaming messages between page and iframe.

### CRDT implementations

CRDT – Convergent Replicated Data Type.

* [Syncable](lib/Syncable.js) – abstract base class that implements most of op(log) related logic.
    A Syncable is an abstract object that is "synced".
    Syncables have a number of hidden fields, \_version and \_id being the most important.
    The \_oplog field contains some of the applied operationopedia; which and how many depends on implementation
    (e.g. see log compaction discussion by Kreps).
* [Model](lib/Model.js) – simple Last-Write-Wins implementation, extends Syncable.
    Backbone-like synced JavaScript object.
* [Set](lib/Set.js) – simple collection type, set of Syncables, extends Syncable.
    Differently from Backbone, that is not an array, because arrays behave poorly under concurrent edits.
    Still, a Set can be sorted.
* [Vector](lib/Vector.js) – ordered list of Syncables.
* [Text](lib/Text.js) (plain text).

### Storages

**Storage** is (formally) a replica that does not implement the logic.
    Practically, that is some storage :)
    Normally, Storage implementations use some dual state+log scheme to persist or cache object replicas.

* [Storage](lib/Storage.js) – base storage logic.

* [FileStorage](lib/FileStorage.js) – flushes object state snapshots to separate files (periodically)
    while streaming all operations to a single log file (in real time).
    Extends Storage.

* [SharedWebStorage](lib/SharedWebStorage.js) – client-side storage, may use localStorage or sessionStorage to cache data.
    The role of SharedWebStorage is dual:
    it may also bridge ops from one browser tab/window to another using HTML5 "onstorage" events.
    Extends Storage.

* [LevelStorage](lib/LevelStorage.js) – stores data in LevelDB. Extends Storage.

* [MongoStorage](lib/MongoStorage.js) – stores data in MongoDB. Extends Storage.

## Contact

* Victor Grishchenko https://github.com/gritzko
* Aleksei Balandin https://github.com/abalandin

Follow SwarmJS on Twitter ([@swarm_js](https://twitter.com/swarm_js)).

Read our [blog](http://swarmjs.github.io/).

## Contributing

TODO


# Swarm 0.2 (hysterical)

New opportunities bring new challenges; now, having all that laptops, smartphones and tablets on WiFi/3G, we need handover (aka continuity), real time sync and offline work. Those requirements stressed classic request-response HTTP architectures leading to fix-on-a-fix stacks that are far from perfection. Our dream is to develop distributed applications like good old local MVC apps, by fully delegating the data caching/synchronization magic to a dedicated layer. We want to deal with the data uniformly, no matter where it resides. We believe, that CRDT is the only approach that allows to fully embrace the reality of distributed data. Swarm is a CRDT-based replicated model library (M of MVC) that keeps your data correctly cached and synchronized in real time using any storage and transport available.

The problem of data synchronization is indeed purely technical with no direct relation to the business logic. Still, data sync becomes an issue in a complex web app. It is still a major challenge to implement real-time sync, intermittent connectivity support and caching. Very soon, you will find yourself on the toughest pages of a CS textbook (see AP of CAP).

Our vision is to make distributed collaborative apps with the same ease we did good old local MVC apps. We achieve that by enhancing the classic MVC architecture with Replicated Model (M+VC) that embeds all the synchronization/caching magic. Once we isolate all the replication inside the model, the rest of the MVC loop may make no distinction in processing either local or remote events. Consequently, by defining both presentation and logic over a local replica of the model we achieve perfect compartmentalization. The transition from MVC+API to M+VC is somewhat comparable to a typical jQuery → Backbone transition in regard to the degree it sorts things out. Instead of endlessly juggling caches, local copies, APIs calls and db accesses, developers may now concentrate on logic and presentation.

Well, but teaching the model to replicate and synchronize "on its own" is a major challenge. Indeed, replicas must be able to function semi-autonomously, as any locking or blocking nixes both usability and performance in a distributed system. Mathematically, the most bulletproof approach to the problem was Commutative Replicated Data Types (CRDT). The CRDT theory is a dramatic improvement on Operational Transformation in handling concurrent changes in near-real-time systems. CRDT tolerates divergence of replicas and varying operation orders, aiming to reconciliate changes eventually, once all the writes spread to all the replicas. CRDT is fundamentally asynchronous, survives intermittent connectivity and perfectly matches reactive architectures.

Our other goal is a smooth scaling path. If both logic and presentation are neatly compartmentalized, then deployment options may vary without much of disruption. That "deployment" stage slows down development way too often! A developer should be able to start developing an app using Chrome as an IDE and local storage as a backend, then switch to SaaS and later on to a separate backend cluster. That should not be a one-way road: the ability to debug a large app piece by piece locally is priceless!

Again, our method is to orthogonalize data delivery, logic and presentation: define the logic over a local replica, save and sync the replica in the background. This Replicated Model approach is like Dropbox for your objects.

On the engineering side, our mission was to design a minimal CRDT basis to implement a lightweight Backbone-like framework on top of it. Swarm employs a pure op-based flavor of CRDT, where an object is essentially a stream of mutation events (ops). Based on those partially ordered Lamport-timestamped operation logs, Swarm implements CRDT data types. Swarm operations are represented as key-value pairs where the key is a "specifier", a compound id consisting of class, object id, Lamport timestamp and operation name. The value is arbitrary JSON. All the operation routing, ordering, storage and application is based on specifiers.

Swarm works well offline and under intermittent connectivity; it may cache data and resync it later, incuding the case of browser restart.


## License

[The MIT License](LICENSE)

Copyright (c) 2012-2014 Victor Grishchenko, Citrea LLC

Copyright (c) 2012-2014 Aleksei Balandin, Citrea LLC
