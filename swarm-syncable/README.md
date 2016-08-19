Swarm: replicated data types (syncables)
========================================

This package contains Swarm replicated data types (RDTs) defined over
a partially ordered log of operations (POLO, also hyperlog).
Practically, this is Swarm client core (see test/ for APi use examples).

- [x]   OpStream - a stream of operations, our most fundamental abstraction
- [x]   Syncable (+RDT) - the abstract base class for all syncables 
- [ ]   Host - a container for Syncables, handles all the server/peer sync
- Basic syncable types
    - [ ]   LWWObject - a last-write-wins object
        * merge is per-field, the bigger timestamp wins
        * can only have primitive fields (strings, numbers,
          references to other syncables)
        * stream-friendly (field name is mentioned in the specifier)
        * the metadata object (type /Swarm) is actually an LWWObject
    - [ ]   LWWArray - last-write-wins array/matrix
        * can't add/remove rows/columns
        * primitive fields
    - [ ]   LWWJSON - a deep JSON object
        * deep merge
    - [ ]   Counter - (CRDT) an integer that is modified by increments/decrements
    - [ ]   ORSet - (CRDT) a set of JSON objects
        * arbitrary on-demand client-side sorting

In Swarm, everything is an OpStream:

* a database is a partially ordered stream of ops (p.o. log, hyperlog)
* a Peer is an instance the database, it only has its local linear
        *arrival* order,
* a Host is a subset of the full log, as a client only subscribes
        to some objects,
* an object is a partially ordered stream of ops too
        (a database has many objects), and finally
* a Syncable is an instance of an object, having its own local
        linear arrival order.

Hence, Peer, Host and Syncable implement the
[OpStream](test/00_OpStream.js) interface.
As OpStream is asynchronous, any network transport or storage implements
that interface too. 

A Syncable object is split into two parts: 
* RDT, the inner state machine that implements all the math,
* a Syncable: the outer JavaScript API, including all the write, 
    query and listen methods.

General RDT state-machine-like rules are:
* every RDT starts at the zero (default) state of its respective type;
* every mutation to an RDT is serialized as an immutable atomic operation (op);
* every such op is eventually delivered to every replica of the object;
* the order of delivery may vary, but it never violates causality;
* once all the ops reach all the replicas, their states converge.

Each Syncable is synchronously connected to its Swarm Host.
A changed Syncable submits an op requests to its host, so
the host creates an immutable op and feeds it back to the Syncable and its RDT.
A hostless Syncable is read-only, although you can feeds it ops manually. 

Syncable's id is typically a [Lamport timestamp][stamp] of the object
creation event. Global objects may have transcendent (zero origin)
Base64x64 ids.

*Syncable.Ref* is a small class used as a wrapper for a reference
(i.e. one syncable referring to another).

[base64]: https://gritzko.gitbooks.io/swarm-the-protocol/content/64x64.html
[spec-pic]: http://swarmjs.github.io/images/spec.png
[op]: https://gritzko.gitbooks.io/swarm-the-protocol/content/op.html
[stamp]: https://gritzko.gitbooks.io/swarm-the-protocol/content/stamp.html
