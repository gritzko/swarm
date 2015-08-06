Swarm: syncable objects (CmRDTs)
================================

![specifier][spec-pic]

This package contains Swarm commutative replicated data types (CmRDTs) defined over a partially ordered log of operations (POLO). Throughout the code, such objects are named *syncables*.

General state machine-like rules are:
* every syncable starts at the zero (default) state of its respective type;
* every mutation to a syncable is serialized as an immutable atomic operation;
* every such op is eventually delivered to every replica of that object;
* the order of delivery may vary, but it never violates causality.

Syncables assume those conditions to be true, but they are completely oblivious of the ways of operation delivery.
Op delivery and storage as well as subscription management is performed by Router (forward ops) and Storage (keeps op logs, generates diffs), see the swarm-node package.

An op is serialized as a key-value pair where the key specifies all the generic features of an op, while everything type-specific is isolated into the value.

The key (also named a *specifier*) is a compound op identifier that contains:

* data type name (like "Model" or "Set"),
* object's id,
* Lamport timestamp (time + process id),
* operation name.

Object's id is typically a Lamport timestamp of the object creation event, although arbitrary [Base64 ids][base64] are possible.

A value is an arbitrary string, the actual format depends on the data type.

See the pic above for a typical serialized specifier-value pair.

## API

Key classes and methods of the package are listed below. Please rely on comments for additional information.

### Spec

The class is a thin wrapper around a serialized specifier. API is based on *quants* (/#!.) and base64 tokens.

See *Spec.Parsed* for a parsed specifier.

### Op

Op is a clas for a single operation, containing the spec -- value pair and a reference to the source the op was received from.
It also contains routines to serialize/deserialize an op into/from a line-based format:

* op.toString()
* Op.parse()

### Syncable

Syncable is an "abstract" base class for all syncables.
It contains all the necessary metadata fields ("underscoreds": `_id`, `_version`, `_listeners`, also `_host` for multi-host setups).
It also implements all the API-side listen/emit methods.

Syncable is the outer API side of a CRDT object that mimicks a "plain" JavaScript object (POJO).
The actual CRDT state and all the CRDT metadata is hidden in the inner state object (Syncable.Inner).
Essentially, the inner object is a state machine that consumes ops and produces the outer state.

The primary Syncable object workflow is to

# call its API methods (like `Model.set`) that
# prepare CRDT ops and submit them to the Host that
# feeds ops to the object's inner state that
# regenerates the outer state based on those changes.
# (later on, the Host relays new ops to other replicas)

An alternative workflow is to

# change the object's fields directly and
# invoke the save() method that makes a diff of the original and the existing state to
# prepare ops and submit them to the Host that
# feeds them to the inner state machine that
# changes its state and
# regenerates the outer state.

The inner-outer state duo has some advantages often associated with immutability.
In particular, it is trivial to check whether a syncable has changed by looking at its `_version` field.

*Syncable.Ref* is a small class used as a wrapper for a reference (i.e. one syncable referring to another).

### Host

Host, acts as a registry of all the sessions' syncables and a keeper of the clock.
In the Lamport's model terms, it is a "process".
Normally, there is one host per environment. Primarily in testing environments, multiple hosts can be active at the same time, see `Host.multihost` and `Host.localhost`.


[base64]: https://github.com/gritzko/swarm/tree/master/stamp
[spec-pic]: http://swarmjs.github.io/images/spec.png
