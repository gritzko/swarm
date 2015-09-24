# Swarm replica

Swarm is a sync-centric database implementing Commutative Replicated Data Types ([CmRDTs][cmrdt]). CmRDTs are op-based, hence Swarm is built on top of a partially ordered log of operations, very much like classic databases are built on top of totally ordered logs.

Replica is the part of Swarm that does "synchronization" per se. Replicas store, synchronize and serve the oplog to clients which implement actual CRDT datatypes (Hosts, see [swarm-syncable][sync]).
Replica is oblivious to data types and logic; its mission is to get all the ops delivered to all the object's replicas, peferably once.

Replica's algorithms are isomorphic (same on the client and server sides).
Each Replica has one "upstream" and many "downstreams", be it Hosts or other Replicas.
This Replica implementation keeps its data in a storage engine accessed through the [LevelUp][levleup] interface. Normally, that is LevelDB on the server, IndexedDB on the client.

Differently from a classic database, a Replica normally contains a partial dataset. On the client side, that is the subset of interest to a particular user. On the server side, one replica contains a "shard" unless all the data fits into a single Replica process.

[levelup]: https://github.com/Level/levelup/
[cmrdt]: https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#Operation-based_CRDTs
[sync]: ../syncable/README.md
