# Swarm
[![Build Status](https://img.shields.io/travis/gritzko/swarm/master.svg)](https://travis-ci.org/gritzko/swarm)

_reactive data sync lib: replicated model for your web app_

New opportunities bring new challenges; now, having all that laptops, smartphones and tablets on WiFi/3G, we need handover (aka continuity), real time sync and offline work. Those requirements stressed classic request-response HTTP architectures leading to fix-on-a-fix stacks that are far from perfection. Our dream is to develop distributed applications like good old local MVC apps, by fully delegating the data caching/synchronization magic to a dedicated layer. We want to deal with the data uniformly, no matter where it resides. We believe, that CRDT is the only approach that allows to fully embrace the reality of distributed data. Swarm is a CRDT-based replicated model library (M of MVC) that keeps your data correctly cached and synchronized in real time using any storage and transport available.

The problem of data synchronization is indeed purely technical with no direct relation to the business logic. Still, data sync becomes an issue in a complex web app. It is still a major challenge to implement real-time sync, intermittent connectivity support and caching. Very soon, you will find yourself on the toughest pages of a CS textbook (see AP of CAP).

Our vision is to make distributed collaborative apps with the same ease we did good old local MVC apps. We achieve that by enhancing the classic MVC architecture with Replicated Model (M+VC) that embeds all the synchronization/caching magic. Once we isolate all the replication inside the model, the rest of the MVC loop may make no distinction in processing either local or remote events. Consequently, by defining both presentation and logic over a local replica of the model we achieve perfect compartmentalization. The transition from MVC+API to M+VC is somewhat comparable to a typical jQuery → Backbone transition in regard to the degree it sorts things out. Instead of endlessly juggling caches, local copies, APIs calls and db accesses, developers may now concentrate on logic and presentation.

Well, but teaching the model to replicate and synchronize "on its own" is a major challenge. Indeed, replicas must be able to function semi-autonomously, as any locking or blocking nixes both usability and performance in a distributed system. Mathematically, the most bulletproof approach to the problem was Commutative Replicated Data Types (CRDT). The CRDT theory is a dramatic improvement on Operational Transformation in handling concurrent changes in near-real-time systems. CRDT tolerates divergence of replicas and varying operation orders, aiming to reconciliate changes eventually, once all the writes spread to all the replicas. CRDT is fundamentally asynchronous, survives intermittent connectivity and perfectly matches reactive architectures.

Our other goal is a smooth scaling path. If both logic and presentation are neatly compartmentalized, then deployment options may vary without much of disruption. That "deployment" stage slows down development way too often! A developer should be able to start developing an app using Chrome as an IDE and local storage as a backend, then switch to SaaS and later on to a separate backend cluster. That should not be a one-way road: the ability to debug a large app piece by piece locally is priceless!

Again, our method is to orthogonalize data delivery, logic and presentation: define the logic over a local replica, save and sync the replica in the background. This Replicated Model approach is like Dropbox for your objects.

On the engineering side, our mission was to design a minimal CRDT basis to implement a lightweight Backbone-like framework on top of it. Swarm employs a pure op-based flavor of CRDT, where an object is essentially a stream of mutation events (ops). Based on those partially ordered Lamport-timestamped operation logs, Swarm implements CRDT data types. Swarm operations are represented as key-value pairs where the key is a "specifier", a compound id consisting of class, object id, Lamport timestamp and operation name. The value is arbitrary JSON. All the operation routing, ordering, storage and application is based on specifiers.


Speaking of Swarm API, the best option at this moment is to learn by example and by reading the code. Swarm implements M of MVC, so key classes are:

* Model is a Backbone-like synced JavaScript object (extends Syncable).
* Set is the Swarm primary collection type (extends Syncable). Differently from Backbone, that is not an array, because arrays behave poorly under concurrent edits. Still, a Set can be sorted.
* Syncable is an abstract base class that implements most of op(log) related logic. A Syncable is an abstract object that is "synced". Syncables have a number of hidden fields, \_version and \_id being the most important. The \_oplog field contains some of the applied operations; which and how many depends on implementation (e.g. see log compaction discussion by Kreps).
* Host is (practically) a user session, and (formally) a partial replica of a dataset. Normally, a Host has some Storage and one or more Pipes to other Hosts.
* Storage is (formally) a replica that does not implement the logic. Practically, that is some storage :) Normally, Storage implementations use some dual state+log scheme to persist replicas. This particular example implementation flushes object state snapshots to separate files (periodically) while streaming all operations to a single log file (in real time).
* Pipe is a connection to a remote Host backed by a standard node.js-compatible Stream. Pipes and Streams are mostly used internally. An average developer is supposed to simply use URIs.

Swarm works well offline and under intermittent connectivity; it may cache data and resync it later, incuding the case of browser restart. 
