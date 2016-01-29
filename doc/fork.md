# Database forking

Swarm is a sync-centric database system, every database is expected to exist in numerous copies. How are those copies created? Similarly to the Unix process model, the only correct way to create a copy is *forking*. A forked copy may inherit all of the original’s data, some part of it, or nothing. Let’s suppose we have a root copy of a database named `data`. Its handshake is `/Swarm+Replica#data!mytime+swarm.on`. Note that `swarm` is our «root» replica.

## Downstream

The most common case of forking is creating a downstream replica. Suppose, a client connects to our server. Thus, it becomes a part of the replica tree. The structure of the tree is reflected in replica identifiers. Those are tree path-like, using tilde as a separator. In our case of a single root server, the fourth downstream replica created for a user named `gritzko` will likely be named `swarm˜gritzko˜4` (full tree form). By convention, we abbreviate that to `gritzko˜4` (it’s annoying to mention `swarm` in every timestamp). Hence, the new replica’s handshake is `/Swarm+Replica#data!mytime+gritzko˜4.on`.

Typically, new replicas are created empty, but it is possible to clone all the data to a new replica or bootstrap it with some subset. The latter is quite handy for server-side rendering and client-side rehydration.

Note that our naming convention creates a virtual replica named `swarm˜gritzko`, which does not actually exist. That virtual upstream for `swarm˜gritzko˜4` is made with the sole purpose of mentioning the user id in the replica id. Otherwise, we’ll do just fine with `swarm˜27zK` or something. We may also use `swarm˜mycompany˜myname˜serial` or any other convention as long as de-facto upstream-downstream relations fit into the de-jure replica identifier tree.

## Shard

Suppose, one process/server can no longer handle the entire database. Such a database needs to be sharded then. In such a case, a fork inherits a part of the data (by default, one half). Shards cover different subsets of objects, so their clocks can not conflict. Hence, they are still considered the same replica, their handshakes are `/Swarm+Replica#data+00W0!mytime+swarm.on` and `/Swarm+Replica#data+W0˜˜!mytime+swarm.on`. Note that the name of a database is extended with Base64 hash value ranges, `[00,W0)` and `[W0,˜˜)`.

Normally, shards must reside behind a *switch* server that forwards all the incoming object subscriptions to their respective shards. Switches are stateless and transparent, so there can be any number of them.

## Ring

Let’s suppose we want to create geo-distributed copies of our database. Copies sync to each other continuously, but they must also keep working if disconnected. In such a case, replicas will have independent clocks and independent local operation orders. Hence, we cannot treat them like they are shards of the same replica. Let’s call those *clusters*. Clusters get their own replica identifiers: `swarm˜1` and `swarm˜2`. So, `swarm` becomes their *virtual* upstream. In fact, they treat each other as upstream. If we’ll make three clusters, they will form a ring (1>2>3>1). If one cluster dies, the rest still form a connected chain and synchronize all the changes. Their handshakes are: `/Swarm+Replica#data!mytime+˜1.on`, `/Swarm+Replica#data!mytime+˜2.on` and so on.

Clusters have different local operation orders. Hence, a client that was forked from one cluster can not re-synchronize to another. Our end-user replica identifiers will look like `˜2˜gritzko˜4` (full form `swarm˜2˜gritzko˜4`).

## Slave

Sometimes we need to scale reads in our local cluster. We don’t want to use rings of clusters as we need identical operation orders. That way, a client may sync to any of our local copies. Hence, we resort to the classic master-slave architecture: we attach several *slaves* to a master, quite likely in a chain formation. All reads are done locally at a slave, while all the writes are forwarded to the master first. Slaves have the master as their upstream replica, so they save and relay new ops in exactly the same order as the master.

Slave handshakes look exactly like their master’s and clients can’t tell them apart. Actually, a client’s object subscription may be served by a slave of a shard in a cluster, but only the cluster id will be visible to the client.
