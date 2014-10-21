# Swarm
[![Build Status](https://img.shields.io/travis/gritzko/swarm/master.svg)](https://travis-ci.org/gritzko/swarm)

_reactive data sync lib: replicated model for your web app_

## Introduction

New opportunities bring new challenges; now, having all that laptops, smartphones and tablets on WiFi/3G, we need handover (aka continuity), real time sync and offline work. Those requirements stressed classic request-response HTTP architectures leading to fix-on-a-fix stacks that are far from perfection. Our dream is to develop distributed applications like good old local MVC apps, by fully delegating the data caching/synchronization magic to a dedicated layer. We want to deal with the data uniformly, no matter where it resides. We believe, that CRDT is the only approach that allows to fully embrace the reality of distributed data. Swarm is a CRDT-based replicated model library (M of MVC) that keeps your data correctly cached and synchronized in real time using any storage and transport available.

The problem of data synchronization is indeed purely technical with no direct relation to the business logic. Still, data sync becomes an issue in a complex web app. It is still a major challenge to implement real-time sync, intermittent connectivity support and caching. Very soon, you will find yourself on the toughest pages of a CS textbook (see AP of CAP).

Our vision is to make distributed collaborative apps with the same ease we did good old local MVC apps. We achieve that by enhancing the classic MVC architecture with Replicated Model (M+VC) that embeds all the synchronization/caching magic. Once we isolate all the replication inside the model, the rest of the MVC loop may make no distinction in processing either local or remote events. Consequently, by defining both presentation and logic over a local replica of the model we achieve perfect compartmentalization. The transition from MVC+API to M+VC is somewhat comparable to a typical jQuery → Backbone transition in regard to the degree it sorts things out. Instead of endlessly juggling caches, local copies, APIs calls and db accesses, developers may now concentrate on logic and presentation.

Well, but teaching the model to replicate and synchronize "on its own" is a major challenge. Indeed, replicas must be able to function semi-autonomously, as any locking or blocking nixes both usability and performance in a distributed system. Mathematically, the most bulletproof approach to the problem was Commutative Replicated Data Types (CRDT). The CRDT theory is a dramatic improvement on Operational Transformation in handling concurrent changes in near-real-time systems. CRDT tolerates divergence of replicas and varying operation orders, aiming to reconciliate changes eventually, once all the writes spread to all the replicas. CRDT is fundamentally asynchronous, survives intermittent connectivity and perfectly matches reactive architectures.

Our other goal is a smooth scaling path. If both logic and presentation are neatly compartmentalized, then deployment options may vary without much of disruption. That "deployment" stage slows down development way too often! A developer should be able to start developing an app using Chrome as an IDE and local storage as a backend, then switch to SaaS and later on to a separate backend cluster. That should not be a one-way road: the ability to debug a large app piece by piece locally is priceless!

Again, our method is to orthogonalize data delivery, logic and presentation: define the logic over a local replica, save and sync the replica in the background. This Replicated Model approach is like Dropbox for your objects.

On the engineering side, our mission was to design a minimal CRDT basis to implement a lightweight Backbone-like framework on top of it. Swarm employs a pure op-based flavor of CRDT, where an object is essentially a stream of mutation events (ops). Based on those partially ordered Lamport-timestamped operation logs, Swarm implements CRDT data types. Swarm operations are represented as key-value pairs where the key is a "specifier", a compound id consisting of class, object id, Lamport timestamp and operation name. The value is arbitrary JSON. All the operation routing, ordering, storage and application is based on specifiers.

Swarm works well offline and under intermittent connectivity; it may cache data and resync it later, incuding the case of browser restart.

### Features

* Isomorphic JavaScript.
* Realtime collaboration support.
* Offline and intermittent connectivity ready.

## Installation

`npm install swarm`

## Usage (Code Samples)

### How to create own simple LWW model (MyModel.js)

```js
var Swarm = require('swarm');

module.exports = Swarm.Model.extend('MyModel', {
    defaults: {
        field1: 'val',
        field2: 0
    }
});
```

### Simple NodeJS Swarm Server (server.js)

```js
var http = require('http');

// TODO npm install ws
var ws_lib = require('ws');

// TODO npm install swarm
var Swarm = require('swarm');

// TODO include your model files here require('./MyModel.js');

// use file storage
var fileStorage = new Swarm.FileStorage('.swarm');

// create Swarm Host
var swarmHost = new Swarm.Host('swarm~nodejs', 0, fileStorage);
// and make it the default Host
Swarm.env.localhost = swarmHost;

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

// accept incoming WebSockets connection
wsServer.on('connection', function (ws) {
    console.log('new incoming WS');
    swarmHost.accept(new Swarm.EinarosWSStream(ws), { delay: 50 });
});

// handle exit signals
function onExit(exitCode) {
    console.log('shutting down http-server...');
    httpServer.close();
    console.log('closing swarm host...');
    app.swarmHost.close(function () {
        console.log('swarm host closed');
        process.exit(exitCode);
    });
}
process.on('SIGTERM', onExit);
process.on('SIGINT', onExit);
process.on('SIGQUIT', onExit);
```

### How to use model on client (app.js)

```js
// 1. create local Host
var swarmHost = new Swarm.Host('unique_client_id');

// 2. connect to server
swarmHost.connect('ws://localhost:8000/');

// 3. create model instance
var object = new MyModel();
// OR var object = swarmHost.get('/MyModel');
// OR var object = new MyModel({field1: 'x', field2: 10});

// 4. wait for object initialization
object.on('init', function () {
    // local object replica has state now
    // and can be operated like this:
    object.set({field1: 'new_value', field2: 20});
});

// 5. subscribe to events changing the object
object.on(function onObject1Changes(spec, val, source) {
    console.log('object1 event: ', spec, val);
});
```

### Other samples

* [Swarm+React TodoMVC](https://github.com/gritzko/todomvc-swarm)
* [Swarm Demo3](https://github.com/abalandin/swarm-example)

## Swarm API Quickstart

Speaking of Swarm API, the best option at the moment is to learn by example and by reading the code.
Swarm implements M of MVC, so key classes are:

**Host** is a container for **CRDT** (Convergent Replicated Data Type) object replicas.
**Hosts** interact each other through **Streams** by sending **Events**.
Each **Host** can have some **Storage** for persistence or caching.
**Event** is a pair: **Specifier** and **Value**.
**Specifier** describes what object replica has been changed, it contains unique id and name of an event.
**Value** contains some parameters of an **Event**.

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

## Contribution

TODO

## License

[The MIT License](LICENSE)

Copyright (c) 2012-2014 Victor Grishchenko, Citrea LLC

Copyright (c) 2012-2014 Aleksei Balandin, Citrea LLC
