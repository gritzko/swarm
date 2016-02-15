# The Swarm protocol 1.0

Swarm is a sync-centric reactive database designed to naturally function as multiple distributed replicas, not necessarily connected all the time.
Once you change one replica, others also get the change, eventually.
Swarm is information-centric, like git: it addresses the data independently of its storage location.
Similarly, it explicitly versions data to allow for:
* unlimited caching,
* offline work,
* prefetch,
* real-time updates.

Swarm is made for the world of powerful mobile devices, intermittent wireless internet connections, logic-on-the-client apps and web apps, all the conditions classic databases are not well fit for.

Swarm is an upside-down database in the same sense as Kafka is a database inside-out.
Swarm is built around a *partially* ordered log of operations, CRDT object and other things built on top of that.
Not the master server, but clients are considered the source of truth (hence, upside-down).
Client replicas create immutable operations; the server-side infrastructure serves (right, tautology) to propagate that ops to all the interested replicas.

This document covers Swarm data model, the protocol, and interfaces.

## Rationale for op-based CRDTs

Swarm is an op-based CRDT system. Conflict-free replicated data types
allow for automatic merge of concurrent changes, which is critical for highly asynchronous and offline environments.

While state-based CRDTs are much simpler to implement and harder to break, those are mainly suitable for a [data center][riak]. "State-based" means that changes do not propagate incrementally. Instead, a full state should be passed around. That can be relieved with [deltas][TomTom], but deltas compromise simplicity and reliability.

Op-based CRDT offload lots of functions to a "causal broadcast", which delivers all the ops to all the replicas preserving the causal order. But, all the changes propagate incrementally, which is much better for realtime and/or limited bandwidth scenarios.
On the other side, causal broadcast provides guarantees that greatly
simplify development of CRDT data structures.

A special note regarding the use of [version vectors][vv]. Strictly speaking, it is impossible to implement a partially-ordered log system with no version vectors, in one form or another. (Swarm is partially ordered, while all classic SQL databases are totally-ordered, in theory.)
Version vectors pose a great inconvenience for a production system, mainly due to the fact that their size depends on the size of the system.
In other words, they scale poorly.
Especially, in the case of Swarm, where every client has a partial replica of a database and every object is synchronized separately.
Swarm mostly restricts communication patterns to trees (as opposed to full mesh gossip) and that mostly relieves us from the need for version vectors.
At least, they don't appear in the protocol and data structures, most of the time.

[TomTom]: https://speakerdeck.com/ajantis/practical-demystification-of-crdts
[riak]: http://basho.com/tag/crdt/
[vv]: https://en.wikipedia.org/wiki/Version_vector

## Replicas, sources, operations, databases, ids

A Swarm *database* exists in numerous, most often partial, *replicas*, as copying the entire database over to every client is not OK.
A database has a name, which is a base64 string. Swarm employs a special variety of Base64 (using '~' and '-', plus all symbols go in the ASCII order to ensure meaningful lexicographic comparison).
Replicas multiply by [forking][fork] *downstream* replicas, much like Unix processes do.
Hence, there is a tree of replicas.
Every replica has one *upstream* and, potentially, many downstream replicas.
Replica identifiers reflect their tree-like structure.

Every object is necessarily synchronized to the upstream, hence replicas of a particular object form a (connected) spanning tree of two-way subscriptions.
An object may be passively cached (no new updates coming), then it is out of the spanning tree. Once all the downstream subscriptions are canceled, the upstream subscription may be canceled too.

As replica ids are included in all the timestamps, we employ some practical abbreviations. Valid replica name patterns are:
* `swarm` the root replica,
* `alice~repl1` client-side replica (shortcut for `swarm~alice~repl1`),
* `~cluster~bob~repl2` client-side replica synchronized to a particular cluster (shortcut for `swarm_cluster~bob~repl2`),
* `carol~repl3~tier2repl4` 2nd tier user replica (shortcut for `swarm~cluster~carol~repl3~tier2repl4`)

The need for clusters and 2nd tier replicas needs to be explained.
In a single data center we can have various master-slave schemes to ensure consistent operation order for a single object at every server-side replica.
Having geo-distributed setups, we should provide for the case of split-brain (inter data center link failure).
Hence, the op order may vary for different clusters.
A client that synchronizes to one cluster can not re-connect to another one.
On the client side, on-premises and/or on-device caches are implemented as 2nd tier replicas.
For example, multiple processes running on the same device can synchronize to the same local database replica.
See more detailed explanations in the [forking document][fork].

Swarm is an op-based system, so every mutation is expressed as an atomic operation (op).
Every op is stamped with a globally unique Lamport-like *stamp*, like `sometime+alice~repl1`.
The former part is an actual time stamp in Base64, `+` is a separator and the latter part is the *origin* (originating replica id).
Although this differs from the original [Lamport timestamp][lamp] scheme, it satisfies the same requirements.

Operations are relayed by downstream-upstream connections.
Every connection has an unique Lamport-like *source* stamp (timestamp plus downstream replica id).
As order guarantees can only hold within the same connection, it makes a difference which connection an operation arrived by.

[fork]: ./fork.html
[lamp]: https://en.wikipedia.org/wiki/Lamport_timestamps

## The OpSource interface

OpSource is the primary interface for either remote or local Swarm subsystems. Essentially, it is a stream of ops. The interface is asynchronous, which helps to unify the cases of local/synchronous, local/asynchronous and remote subsystems (e.g in-browser IndexedDB has an asynchronous interface, while WebStorage is synchronous). OpSource consumes and emits three types of events:
* `handshake` that sets a context for the connection: database name, replica ids, source id, etc,
* `op` which is either regular data mutation ops or subscription-related pseudo-ops (`on`, `off`, `error`),
* `end`, the end of the stream. Note that non-fatal errors are relayed as `error` pseudo-ops, while every fatal error causes the `end` event.

API user can both write and read (listen to) those three events.
Every OpSource starts by emitting a [handshake op][hs] that sets the context for the rest of the op stream.
The handshake is followed by any number of regular ops and, finally, the end op.
Writes should happen in the same order.
Each event consumes/delivers one op of the corresponding type.
Op/message patterns correspond to the (wire) protocol with minor variations.
It can be said that OpSource is an API version of the protocol, while the protocol is a serialized OpSource.

[hs]: ./handshakes.html

## Storage/transmission op format

Swarm's primary data format is a stream of operations represented as key-value pairs.
Each operation's unique key is named a *specifier* which is a sequence of Base64 tokens and non-Base64 separators.
Op's value is an arbitrary string that starts with a non-whitespace character and contains no newlines.

A [*specifier*][specs] contains:
* CRDT data *type* name,
* object id (typically, object id is a creation *stamp*),
* the operation's stamp,
* the name of the operation.

`/Model#3uGjd+joe~1x!3uHRl+joe~1x.set` is a typical example: a specifier for a `set` op in some Model.
The alphanumeric order of specifiers is meaningful, as it groups one object's operations together and it complies with the causal order.

Such a spec-value pair is conveniently stored in any ordered key-value database.
For transfer, it transforms into a simple line-based representation, spec-whitespace-value-newline.
Swarm does not use JSON serialization for the protocol itself.
First, to avoid JSON overhead.
Second, because JSON lacks an convenient ordered key-value collection (`{}` is unordered, `[]` is not key-value, `[{}]` is complicated and needs to be chained).
On the other hand, op values may be JSON or anything, that is up to a particular data type to decide.
The core of the system treats values as opaque strings.

To abbreviate the serialized form, most common tokens are omitted in case they match defaults. Default type is Model, default stamp is the connection's source id and the default op name is `on`.

Subscription ops may carry chunks of an op log (aka *patches*). Patches either bootstrap a new replica or replay updates the replica missed while being offline. Patch ops are indented and immediately follow their subscription op.
The most convoluted op example is likely a subscription op with an initial state and a tail of an op log.
```
#origstmp+author~repl
    !opstmp+author~repl.~state {"some initial state"}
    !opstmp2+user~repl.set    {"somekey":"somevalue"}
```

[specs]: ???

## Subscriptions/unsubscriptions

Subscription pseudo-ops build the spanning tree of an object's replicas.
Regular subscription ops are per-object.
In some cases, a downstream subscribes to the entire database; then, the [handshake][hs] act as the only subscription.
The subscription tree has the swarm root server as its root and clients as its leaves.
Subscriptions are initiated by downstream replicas. Every incoming downstream subscription recursively creates a subscription to the upstream's upstream, if it does not exist yet.
That does not mean that intermediary nodes will necessarily contain the object's copy; a forwarding record suffices in most of the cases.

An (un)subscription pseudo op contains:
* type of an object (/Model can be omitted),
* id of an object (always present),
* the stamp is equal to the connection's source stamp (can be omitted),
* operation name is .on/.off (.on can be omitted).

Replica's guarantees in regard to subscriptions:
* a replica is supposed to process operations sequentially or at least pretend it does so; same object's operations leave a replica in the same order they arrived;
* once .on is sent to a connection, any further new ops on that object are forwarded to that connection too;
* once .off is sent to a connection, no further ops are forwarded there;
* subscriptions are idempotent, new ops are not forwarded twice to the same connection;
* new ops are forwarded to all the subscribers, including the source of the op (echo ops work as an acknowledgement),
* invalid subscriptions are responded with an .error pseudo-op, valid subscriptions are responded with a reciprocal .on, unless they are already reciprocal.

An initial (upstream) subscription's op value is a stamp of the last op previously received from the upstream.
Thus, the upstream knows the position in the log to start replaying from.
A downstream (reciprocal) subscription has a version vector as its value.
That is mainly a convenience, the vector acknowledges ops that the upstream received in the initial subscription's patch.
That is equal to echoing new ops back, but more efficient.

## Dialects

The described protocol is the "canonical" one spoken between remote replicas.
Some Swarm subsystems may speak *dialects*.
For example, a replica talks to its storage subsystem(s) mostly by the same protocol.
The storage is neither upstream, nor downstream as it is a part of the same replica.
Similarly, a replica may speak a dialect of the same protocol to its snapshot slave.
That is a subsystem that produces state snapshots and inserts them into the log.
While the "vanilla" core replica is type agnostic, a snapshot slave actually has all the CRDT type logic inside and it may run in a different process, for example.


## Conclusion

The op-based protocol allows for efficient storage and transmission of Swarm synchronization data.
It enables unlimited client-side caching of the data, real-time update propagation, and offline work.
The protocol guarantees correct and efficient op propagation.
Namely, that all the ops reach all the object's replicas in a causally consistent order and no op needs to be sent twice.
