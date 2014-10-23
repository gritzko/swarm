# Swarm
_reactive data sync lib: replicated model for your web app_

[![Build Status](https://img.shields.io/travis/gritzko/swarm/master.svg)](https://travis-ci.org/gritzko/swarm)

[Swarm](http://swarmjs.github.io/articles/todomvc/) is an isomorphic reactive M-of-MVC library that synchronizes objects in real-time and may work offline. Swarm is perfect for implementing collaboration or continuity features in Web and mobile apps. Swarm supports complex data types by relying on its op-based CRDT base.

You may run your own Swarm server. If you understand what CRDT is, then you may implement your own data types. Free-as-in-freedom (MIT).

![Swarm: deployment](doc/swarm-moscowjs-deployment.png)

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
    The \_oplog field contains some of the applied operations; which and how many depends on implementation
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


## Lyrics

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
