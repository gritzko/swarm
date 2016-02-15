# Database forking

Swarm is a sync-centric database system, where every database is expected to exist in numerous replicas.
Similarly to the Unix process model, the only correct way to create a new replica is to *fork* an existing one.
The newly created copy will keep the parent as its *upstream*.
A replica can only initiate a connection to its upstream and accept connections from downstream replicas.
Downstream replicas may inherit all of the parent’s data, some part of it, or nothing.
A fork's behavior may vary depending on its *role*.
Roles are: Downstream, Shard, Ring, Slave, Switch, or sometimes a mix of those).

Let’s suppose we have a root copy of a database named `data`. Its handshake is `/Swarm#data!mytime+swarm.on`.
Note that `swarm` is our «root» replica.

## Client

The most common case of forking is to create a client's replica.
Suppose, a client connects to our server to become a part of our replica tree.
The operation order at the client is (potentially) different from the server because the client may work offline and even if connected it may generate concurrent ops.
Hence, the downstream gets a new replica identifier.
The identifier reflects the structure of the tree tree; it is tree path-like, using tilde as a separator.
In our case of a single root server, the fourth downstream replica created for a user named `gritzko` will likely be named `swarm˜gritzko˜4` (full tree form).
By convention, we abbreviate that to `gritzko˜4` (it’s annoying to mention `swarm` in every timestamp).
Hence, the new replica’s handshake is `/Client+Swarm#data!mytime+gritzko˜4.on`.

Typically, downstream replicas are created empty, but it is possible to clone all the data to a new replica or bootstrap it with some subset.
The latter is quite handy for server-side rendering and client-side rehydration.

Note that our naming convention "creates" a virtual replica named `swarm˜gritzko`, which does not actually exist.
That virtual upstream for `swarm˜gritzko˜4` is made with the sole purpose of mentioning the user id in the replica id.
We may do just fine with `swarm˜27zK` or something.
We may also use `swarm˜mycompany˜myname˜serial` or any other convention as long as de-facto upstream-downstream relations fit into the de-jure replica identifier tree.

## Shard

Suppose, one process/server can no longer handle the entire database.
Such a database needs to be *sharded* then.
In such a case, a fork inherits a part of the data (by default, one half).
Shards cover different subsets of objects, so their clocks can not conflict.
Hence, they are still considered logically the same replica named `swarm`.
The parent's handshake changes to `/Shard+Swarm#00W0+data!mytime+swarm.on` and the child has `/Shard+Swarm#W0˜˜+data!mytime+swarm.on`.
Note that the name of a database is extended with Base64 hash value ranges, `[00,W0)` and `[W0,˜˜)`.
A new shard may be bootstrapped with all the parent's data or it may incrementally download data from the upstream, depending on conditions.

## Switch

Those shards must reside behind a *switch* replica that forwards all the incoming object subscriptions to proper shards.
Its handshake is `/Switch+Swarm#data!mytime+swarm.on`.
Switches are stateless and transparent, so there can be any number of them.
Switches maintain subscription tables and multiplex ops, but they have no own storage.
Differently from all other roles, a switch has many upstream replicas, namely an array of Shards covering the entire key space.
On the other hand, we already agreed that shards are parts of the same replica, so logically there is one upstream.
Once a shard forks off a new child shard, it notifies its downstream switches, so reconfiguration is fully dynamic.
As a side effect, switches can scale reads as they aggregate subscriptions and multiplex ops.

## Ring

Let’s suppose we want to create geo-distributed copies of our database.
Replicas sync to each other continuously, but they must also keep working if disconnected.
In such a case, replicas will have independent clocks and independent local operation orders.
Hence, we cannot treat them like they are shards of the same replica.
Let’s call those *rings*.
Rings get their own replica identifiers: `swarm˜1` and `swarm˜2`.
So, the former root database becomes their *virtual* upstream.
In fact, they use each other as their upstream.
If we’ll make three rings, they will form a circular chain (1>2>3>1). If one ring dies, the rest still form a connected chain and synchronize all the changes.
Their handshakes are: `/Ring+Swarm#data!mytime+˜1.on`, `/Ring+Swarm#data!mytime+˜2.on` and so on.

Rings have different local operation orders. Hence, a client that was forked from one ring can not re-synchronize to another. Our end-user replica identifiers will look like `˜2˜gritzko˜4` (full form `swarm˜2˜gritzko˜4`).

## Slave

The sync algorithm depends on the upstream's stable operation order.
Thus, loss of a server may lead to loss of the de-facto order, so clients will not be able to synchronize cheaply.
We want any client to be able to sync with any of our local copies, so we need identical operation orders.
Hence, we resort to the classic master-slave architecture: we attach several *slaves* to a master, in a chain formation.
All reads are done at the tail slave, while all the writes are forwarded to the master.
As long as one fork (either master or slave) stays alive, a reconfigured chain can continue to function with no interruptions.

Slave handshakes look exactly like their master’s except for a different role, e.g.
* `/Slave+Swarm#data!mytime+swarm.on` (slave of the root replica) or
* `/RingSlave+Swarm#data!mytime+˜1.on` (mixed role, slave of a ring) or
* `/ShardRingSlave+Swarm#W0˜˜+data!mytime+˜1.on` (wow, slave of a shard ring),
* `/ShardRingSlaveSlave+Swarm#W0˜˜+data!mytime+˜1.on` (unbelievable, a slave of a slave of a shard ring).

It may sound like a difficulty that shard rings have to synchronize to shard rings with equal ranges.
The single-upstream replica tree structure simplifies everything so much that it is definitely worth the effort.

## Components

Internal components can talk dialects of the protocol too.
In such a case those can be understood as "forks" of a local replica.
For example, a Client replica itself only manages op logs, while API objects are created by a "host" that can be attached to the replica locally or use a network connection.
Similarly, a storage engine is separated into a subsystem speaking a dialect of the same protocol.

Such "local" forks have same replica id and same database name as the replica.
They use a replica's clocks or use none.
By convention, local component roles are lowercase, like `host` or `level`.
In some case, components need to use their own clocks (like a host connected by the network).
Then, they get an uppercase role, their own replica id and clocks.

## Resync

Swarm's unifying abstraction is a replica tree.
Namely, a replica may re-sync to an arbitrary other replica.
A tree is a fragile topology and permanent removal of a replica may disconnect a subtree from the root.
In any configuration, the measure of last resort is replica resync.
Resync performance is suboptimal and the correctness is guaranteed for *idempotent* types only.
So, there are better techniques to compensate for replica removal, e.g. hot-spare slaves.
Resync also allows for shortcut syncing between different branches of a tree, in case such a necessity arises.

The most correct way to resync is to merge the full log from the beginning of times.
Unfortunately, that may be impractical.
Swarm is based on an assumption that a change log is *potentially infinite*.
Similarly, Swarm avoids using full version vectors, as their size is potentially infinite too.

Resync is made by a hack: if all object states are made linearly ordered.
Given two states and two log tails, a replica may apply the merged log to the younger state thus producing the resulting state.
(Again, an important requirement is that data types must be idempotent.)

That requires a distinction between *local snapshots* (made by any replica for its own use) and *descending states* that only get produced by their root replica.
If the root replica is temporarily unable to generate states, then op logs grow, which may be a performance issue, but the system stays functional.
