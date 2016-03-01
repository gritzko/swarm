<h1 align=center>Swarm: a sync-centric isomorphic database</h1>
<div align=right><b>Victor Grishchenko, independent consultant</b><br/><br/></div>


The Swarm library was originally conceived as a part of a collaborative editor project. The development of the project led to a realization that we need an universal web/mobile data sync middleware able to function both in real-time and offline modes.
Surprisingly, those seemingly opposite modes faced exactly the same challenge: the synchronous request-response approach (HTTP/RPC/SQL) was no longer applicable in both cases. Asynchrony had to be handled explicitly.

Later on, some trends and conversations persuaded me that a dedicated syncing middleware is badly needed by a broader group of apps. First, today's average user has multiple devices. So, even single-user apps have to sync, preferably in real-time. Second, today's mobile devices have seemingly endless storage capacity but their internet connection is unreliable. Thus, offline mode and greater autonomy becomes highly beneficial for web and mobile apps alike.

That led me by the path of building a general-purpose [*isomorphic*][iso] database, i.e. one able to run simultaneously on the server and client sides to keep them in sync. While following that path, I had to reconsider, reject or adjust many basic distributed system primitives, which is an experience worth sharing.

## Introduction

Our dissatisfaction with existing solutions was based either on poor syncing (the most common case), unsuitability for real-time scenarios (CouchDB/pouchdb) or poor offline behavior (Operational Transformation). We chose the approach based on partially ordered op logs and commutative replicated data types because it satisfied all the requirements.

Server-side use of CRDTs naturally gravitates to state-based [convergent replicated data types][riak] because of their extreme robustness in arbitrary network topologies. The downside of CvRDT is the cost of metadata that accumulates in every object's state. In the case of op-based CmRDTs, the causal broadcast layer provides non-trivial guarantees that greatly reduce the need for per-object metadata and simplify data type [implementation][counters]. Finally, client-side bandwidth constraints favor the [operation-based approach][googledocs].

Hence, I chose CmRDTs and my N1 task was to implement a reliable and scalable oplog storage/synchronization layer. That layer, in turn, relied on a ordered key-value storage engine, which is the greatest common denominator of Web, mobile and server-side environments (IndexedDB, LevelDB, RocksDB, Redis, etc).

A key requirement was to encapsulate all the distributed machinery in those lower layers and to limit above-the-water parts to a plain object-based API.

## Swarm, the database

The Swarm's offline and real-time capabilities rely on the fact its CmRDT op log is partially ordered. That significantly amends the classic [state machine replication model][smr]. Namely, SMR relays changes one way (master to slave), while partially ordered log allows for two-way traffic. Similarly, other classic database constructs had to be adapted to the case of an isomorphic CRDT database.

### Timestamps

Timestamps in distributed systems is an extensive topic. Normally, every operation is timestamped to ensure proper storage and synchronization. Systems like Cassandra or Spanner rely on physical time. That imposes a requirement of synchronized local clocks at every replica. Spanner even employs [custom hardware][spanner] to make physical clocks good enough.
The opposite approach is to make logical clocks reflect the physical time, like in [hybrid clock][buffalo]. Unfortunately, the latter has the same requirement of NTP-synchronized clocks that can not be satisfied on the client side in the general case.

That made me use *adaptable clock*, a variety of hybrid logical clock that prioritizes logical correctness over physical precision. In case the local clock is not well-synchronized, adaptable clocks may knowingly deviate from the (unknown) physical time to ensure logical correctness. The extent of this deviation is limited by the network round trip time (typically on the order of a tenth of a second). Such an approach leaves the requirement of good clocks for the top servers only. The rest of the replicas simply need clocks with a reasonable skew, which is a practical and [well-tested][ledbat] requirement.

The resulting calendar-friendly [Swarm timestamp format][swarm-adaptable] consumes 64 bits in binary or 11 chars in base64: `19Q6IU81001` (mmdHMSssiii, where iii is the sequence number).
A full two-component [logical timestamp][lamp] features a replica id, e.g. `19Q6IU81+kj23`. The alphanumeric order of timestamps fits causality, so the alphanumeric ordering of the log is useful and natural.

### Logs and version vectors

The fact an op is timestamped on the client side makes it immutable further on. That dramatically simplifies things, especially in comparison to [OT][googledocs], which repeatedly rewrites operations in-flight. This immutability turns a database upside-down, in a sense. The master server is no longer the source of truth; it is merely an aggregation and relay point for the op log.

Initial Swarm prototypes used full [compacted][compact] op logs at each replica and full version vectors in the synchronization protocol. That provided the same level of flexibility as state-based CRDTs, as any replica can sync to any other replica. Similarly to CvRDTs, that inflated metadata.

The approach was not scalable, obviously, and the very first [flash crowd][HN] confirmed that. Later versions assumed that op logs are potentially infinite and the number of writers is potentially unbounded, so full log scans and full version vectors have been banned completely, even at the server side.

Such requirements limited the topology to a tree, in the general case. Only idempotent types can be synced by *shortcut* links between any two replicas. Hence, Swarm’s key strategy is to build a spanning tree of *replicas* to propagate every op to every object’s copy (no *gossip* or suchlike).

### Spanning trees

A *spanning tree* is a single unifying abstraction that holds all replicas of a Swarm database together. New Swarm replicas are *forked* from existing replicas of the database. Only an empty new database can be *created* as such. The original becomes its copy's *upstream*. All subscriptions and all new ops must be forwarded to the upstream to guarantee connectedness of the spanning tree. In general, the forking principle allows each replica to make read/write/forwarding decisions based on its local information: upstream, downstreams and its own role.

A *role* (like *shard*, *ring*, *slave*, *client*, etc) is a way to generalize replica functions and behaviors and to define them as variations of the "vanilla" tree-keeping behavior. For example, a forked copy may inherit all, some or no data from its original, depending on its role. *Shards* take over responsibility for a part of the key space from their upstream replicas. *Clients* inherit as much data as they need, but no responsibility. *Slaves* inherit all the data and follow the master's op log further on. Identical op orders allow a slave to take over the responsibility in case its master fails (i.e. to act as a hot spare).

A spanning tree is more of a formal construct used to reason about the op log than an actual topology of message passing. A spanning tree produces an obviously correct and predictable outcome: all replicas get all the ops, possibly in slightly varying orders, with no violations of causality. The actual practical topology may feature rings, master-slave chains or load balancers. For every such topology, we may prove that the resulting log is equivalent to the one produced by some tree, hence the system functions correctly.

### Handshakes

The Swarm replica syncing protocol could not be modeled after anything synchronous like HTTP or RPC. Similarly, it could not reuse the classic asynchronous *pub-sub* approach which relies on *channel* subscriptions. Channels preclude clients from having a partial dataset of their own choosing.

Swarm allows either to subscribe to the entire database or to make per-object subscriptions. Every object is essentially a product of its op log. A subscription starts with a handshake when replicas declare their log progress and exchange missing ops. After the handshake, all the new ops will be relayed to the new subscriber, until the subscription is closed.

The initial version of the protocol relied on three-way handshakes employing version vectors. By limiting the topology to a tree in v1.0.0, the protocol was converted to a more practical two-way handshake based on log *bookmarks*. As a result, each client replica can maintain an arbitrary subset of data for an arbitrarily long period of time. A replica may go offline or let some parts of data become stale, then resync it later if needed.


## Conclusion

By re-fitting and re-inventing some classic concepts I produced a workable model for an isomorphic sync-centric database. Such a database can naturally exist in unlimited and, quite likely, unknown number of distributed partial replicas, most of them on the client side. The design is motivated by a belief that the next step in database scalability is to accommodate swarms of mobile devices with unreliable wireless connections.

[googledocs]: http://googledrive.blogspot.ru/2010/09/whats-different-about-new-google-docs.html
[smr]: http://research.microsoft.com/en-us/um/people/lamport/pubs/implementation.pdf
[spanner]: http://static.googleusercontent.com/media/research.google.com/en//archive/spanner-osdi2012.pdf
[buffalo]: http://www.cse.buffalo.edu/tech-reports/2014-04.pdf
[swarm-adaptable]: AdaptableClock.js
[HN]: https://news.ycombinator.com/item?id=8453036
[compact]: https://cwiki.apache.org/confluence/display/KAFKA/Log+Compaction
[counters]: http://hal.upmc.fr/inria-00555588/document "Section 3.1.1, op-based counter"
[iso]: http://isomorphic.net/ "'isomorphic' in the sense of 'isomorphic js app'"
[riak]: http://docs.basho.com/riak/latest/dev/using/data-types/
[lamp]: https://en.wikipedia.org/wiki/Lamport_timestamps
[ledbat]: https://en.wikipedia.org/wiki/LEDBAT
