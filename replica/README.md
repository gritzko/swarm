# Swarm replica

Swarm is a sync-centric database implementing Commutative Replicated
Data Types ([CmRDTs][cmrdt]). CmRDTs are op-based, hence Swarm is
built on top of a partially ordered log of operations, very much like
classic databases are built on top of totally ordered logs.

Replica is the part of Swarm that does "synchronization" per se.
Replicas store, synchronize and serve the oplog to clients which
implement actual CRDT datatypes (Hosts, see [swarm-syncable][sync]).
Replica is oblivious to data types and logic; its mission is to get
all the ops delivered to all the object's replicas, peferably once.

Replica's algorithms are isomorphic (same on the client and server
sides).  Each Replica has one "upstream" and many "downstreams", be it
Hosts or other Replicas.  This Replica implementation keeps its data
in a storage engine accessed through the [LevelUp][levleup] interface.
Normally, that is LevelDB on the server, IndexedDB on the client.

Differently from a classic database, a Replica normally contains a
partial dataset. On the client side, that is the subset of interest to
a particular user. On the server side, one replica contains a "shard"
unless all the data fits into a single Replica process.

[levelup]: https://github.com/Level/levelup/
[cmrdt]: https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#Operation-based_CRDTs
[sync]: ../syncable/README.md


## OpStreams

Some little clarification on the Swarm domain model and terms.  What
are users, sessions, clocks, databases and subscriptions (ons) ?

First of all, a *user* is an "end user" identified by a login
(alphanum string up to 32 characters long, underscores permitted, like
`gritzko`).  A user may have an arbitrary number of *sessions* (like
apps on mobile devices, browser tabs, desktop applications). Sessions
have unique identifiers too, like `gritzko~1kz` (tilde then a serial
in Base64).  Session ids may be recursive, like `gritzko~1kz~2`.  Each
session has a *clock* that produces a monotonous sequence of Lamport
*timestamps* or simply *stamps* which consist of the local time value
and session id, like `2Ax1k+gritzko~1kz`. Every op is timestamped at
its originating process.

Swarm's synchronized CRDT objects are packed into databases identified
by alphanumeric strings. A session may use multiple databases, but as
the relative order of operations in different databases does not
matter, each db is subscribed to in a separate connection.  The
implementation may or may not guarantee to preserve the relative order
of changes to different objects in the same database.  The client's
session is linked to a de-facto local process (and storage), so it
is likely to be shared between dbs (same as clocks).

Per-object *subscriptions* are optional (that depends on a particular
database). Similarly, access control *policies* are set at per-db
granularity (sample policy: the object's owner can write, others can
read).

The most common interface in the system is an *OpStream*. That is a
single-database op stream going from one session to another.
