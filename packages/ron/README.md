# Swarm Replicated Object Notation 2.0.1 #

Swarm Replicated Object Notation is a format for *distributed live data*.
RON's focus is on continuous data synchronization.
Every RON *object* may naturally have an unlimited number of *replicas* that synchronize incrementally, mostly in real-time.
RON data always merges correctly and deterministically.

RON is information-centric: it aims to liberate the data from its location, storage, application or transport.
There is no "master" replica, no "source of truth". Every event has an *origin*, but every replica is as good as the other one.
Every single object, event or data type is uniquely identified and globally referenceable.
RON metadata makes objects completely independent of the context.
A program may read RON object versions and/or updates from the network,  filesystem, database, message bus and/or local cache, in any order, and merge them correctly.

Consider JSON. It expresses relations by element positioning:
```
{
    "foo": {
        "bar": 1
    }
}
```
RON may express that state as:
```
*lww #1TUAQ+gritzko @`   :bar = 1
     #(R            @`   :foo > (Q
```
Those are two RON *ops*:

 1. some last-write-wins object is created with a field `bar` set to `1` (on 2017-10-31 10:26:00 UTC, by gritzko),
 2. another object is created with a field `foo` pointing to the first object (10:27:00, by gritzko).

Each op is a tuple of four globally-unique UUIDs for its data type, object, event and location, plus some number of value *atoms*.
You may not see any UUIDs in the above example, initially.
The notation does a lot to compress that metadata away.

These are the key features of RON:

* RON's atomic unit is an immutable *op*. Every change to the data is an *event*; every event produces an op. An op may flow from a replica to a replica, from a database to a database, while fully intact and maintaining its original identity.
* Each RON op is context-independent. Nothing is implied by the context, everything is specified explicitly and unambiguously. An op has four globally unique UUIDs for its data type, object, event and location.
* An object can be referenced by its UUID (e.g. `> 1TUAQ+gritzko`), thus RON can express object graph structures beyond simple nesting.
 Overall, RON relates pieces of data by their UUIDs.
 Thanks to that, RON data can be cached locally, updated incrementally and edited while offline.
* An object's state is a *reduction* of its ops. A data type is a reducer function: `lww(state,change) = new_state`. Reducers tolerate partial order of updates. Hence, all ops are applied immediately, without any linearization by a central server.
* There is no sharp border between a state snapshot and a state update. State is change and change is state (state-change duality). A transactional unit of data storage/transmission is a *frame*. A frame can contain a single op, a complete object graph or anything inbetween: object state, stale state, patch, otherwise a piece of an object.
* RON model implies no special "source of truth". The event's *origin* is the source of truth, not a server in the cloud. Every event/object is marked with its origin (e.g. `gritzko` in `1TUAQ+gritzko`).
* A RON frame is not a "message": it has an *origin* but it has no "destination". RON speaks in terms of data updates and subscriptions.
  Once you subscribe to an object, you receive the state and all the
  future updates, till you unsubscribe.
* RON is information-centric. Consider git: once you clone a repo, your copy is as good as the original one. Same with RON.
* RON is a hypermedia format, as data pieces can reference each other globally (imagine a RON-based real-time World-Wide-Web-of-Data).
 Although, both replica ids and data routing must work at global scale then (federated, etc).
* RON is not optimized for human consumption. It is a machine-to-machine language mostly. "Human" APIs are produced by mappers (see below).
* RON employs compression for its metadata. The RON UUID syntax is specifically fine-tuned for easy compression. Consider the above frame uncompressed:
```
*lww #1TUAQ+gritzko @1TUAQ+gritzko :bar = 1
*lww #1TUAR+gritzko @1TUAR+gritzko :foo > 1TUAQ+gritzko
```

One may say, what metadata solves is [naming things and cache invalidation][2problems].
What RON solves is compressing that metadata.

RON makes no strong assumptions about consistency guarantees: linearized, causal-order or gossip environments are all fine (certain restrictions apply, see below).
Once all the object's ops are propagated to all the object's replicas, replicas converge to the same state.
RON formal model makes this process correct.
RON wire format makes this process efficient.


## Formal model

Swarm RON formal model has five key components:

1. An UUID is a globally unique 128-bit identifier. An UUID consists of two 60-bit parts: *value* and *origin*. 4+4 bits are reserved for flags. There are four UUID types:
    * an event timestamp: logical/hybrid timestamp, e.g. `1TUAQ+gritzko`, value is a monotonous counter `1TUAQ`, origin is a a replica id `gritzko`, roughly corresponds to RFC4122 v1 UUIDs,
    * a derived timestamp: same as event timestamp, but refers to some derived calculation, not the original event (e.g. `1TUAQ-gritzko`),
    * a name, either global or scoped to a replica, e.g. `foo`, `lww`, `bar` (global), `MyVariable$gritzko` (scoped),
    * a hash (e.g. `4Js8lam4LB%kj529sMEsl`, both parts are hash sum bits).
2. An op is an immutable atomic unit of data change.
    An op is a tuple of four [UUIDs](uid.md) and zero or more *atoms*:
    * data type UUID, e.g. `lww` a last-write-wins object,
    * object UUID `1TUAQ+gritzko`,
    * event UUID `1TUAQ+gritzko` and
    * location/reference UUID, e.g. `bar`.
    * atoms are strings, integers, floats or references (UUIDs).
3. a frame is an ordered collection of ops, a transactional unit of data
    * an object's state is a frame
    * a "patch" (aka "delta", "diff") is also a frame
    * in general, data is seen as a [partially ordered][po] log of frames
4. a reducer is a RON term for a "data type"; reducers define how object state is changed by new ops
    * a reducer is a pure function: `f(state_frame, change_frame) -> new_state_frame`, where frames are either empty frames or single ops or products of past reductions by the same reducer,
    * reducers are:
        1. associative, e.g. `f( f(state, op1), op2 ) == f( state, patch )` where `patch == f(op1,op2)`
        2. commutative for concurrent ops (can tolerate causally consistent partial orders), e.g. `f(f(state,a),b) == f(f(state,b),a)`, assuming `a` and `b` originated concurrently at different replicas,
        3. idempotent, e.g. `f(state, op1) == f(f(state, op1), op1) == f(state, f(op1, op1))`, etc.
    * optionally, reducers may have stronger guarantees, e.g. full commutativity (tolerates causality violations),
    * a frame could be an op, a patch or a complete state. Hence, a baseline reducer can "switch gears" from pure op-based CRDT mode to state-based CRDT to delta-based, e.g.
        1. `f(state, op)` is op-based
        2. `f(state1, state2)` is state-based
        3. `f(state, patch)` is delta-based
4. a mapper translates a replicated object's state frame into other formats
    * mappers turn RON objects into JSON or XML documents, C++, JavaScript or other objects
    * mappers are one-way: RON metadata may be lost in conversion
    * mappers can be pipelined, e.g. one can build a full RON->JSON->HTML [MVC][mvc] app using just mappers.


Single ops assume [causally consistent][causal] delivery.
RON implies causal consistency by default.
Although, nothing prevents it from running in a linearized [ACIDic][peterb] or gossip environment.
That only relaxes (or restricts) the choice of reducers.

## Wire format (Base64)

Design goals for the RON wire format is to be reasonably readable and reasonably compact.
No less human-readable than regular expressions.
No less compact than (say) three times plain JSON
(and at least three times more compact than JSON with comparable amounts of metadata).

The syntax outline:

1. atoms follow very predictable conventions:
    * integers: `1`
    * e-notation floats: `3.1415`, `1.0e+6`
    * UTF-8 JSON-escaped strings: `строка\n线\t\u7ebf\n라인`
    * RON UUIDs `1D4ICC-XU5eRJ`, `1TUAQ+gritzko`
2. UUIDs use a compact custom serialization
    * RON UUIDs are Base64 to save space (compare [RFC4122][rfc4122] `123e4567-e89b-12d3-a456-426655440000` and RON `1D4ICC-XU5eRJ`)
    * also, RON timestamp UUIDs may vary in precision, like floats (no need to mention nanoseconds everywhere) -- trailing zeroes are skipped
    * UUIDs are lexically/numerically comparable (same order), the Base64 variant is `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~`
3. serialized ops use some punctuation, e.g. `*lww #1D4ICC-XU5eRJ @1D4ICC2-XU5eRJ :keyA 'valueA'`
    * `*` starts a data type UUID
    * `#` starts an object UUID
    * `@` starts an op's own event UUID
    * `:` starts a location UUID
    * `=` starts an integer
    * `'` starts and ends a string
    * `^` starts a float (e-notation)
    * `>` starts an UUID
    * `!` ends a frame header op (a reduced frame has one header op)
    * `?` ends a query header op (a subscription frame has a header)
    * `.` ends a frame (optional)
4. frame format employs cross-columnar compression
    * repeated UUIDs can be skipped altogether ("same as in the last op")
    * RON abbreviates similar UUIDs using prefix compression, e.g. `1D4ICCE+XU5eRJ` gets compressed to `{E` if preceded by `1D4ICC+XU5eRJ` (symbols `([{}])` corespond to 4,5,..9 symbols of shared prefix)
    * by default, an UUID is compressed against the same UUID in the previous op (e.g. event id against the previous event id)
    * backtick ` changes the default UUID to the previous UUID of the same op (e.g. event id against same op's object id)

Consider a simple JSON object: 
```
{"keyA":"valueA", "keyB":"valueB"}
```
A RON frame for that object will have three ops: one frame header op and two key-value ops.
In the tabular form, that frame may look like:
```
type object         event           location value
-----------------------------------------------------
*lww #1D4ICC+XU5eRJ @1D4ICCE+XU5eRJ :0       !
*lww #1D4ICC+XU5eRJ @1D4ICCE+XU5eRJ :keyA    'valueA'
*lww #1D4ICC+XU5eRJ @1D4ICC1+XU5eRJ :keyB    'valueB'
```
There are lots of repeating bits here.
We may skip repeating UUIDs and prefix-compress close UUIDs.
The compressed frame will be just a bit longer than bare JSON:
```
*lww#1D4ICC+XU5eRJ@`{E! :keyA'valueA' @{1:keyB'valueB'
``` 
That is impressive given the amount of metadata (and you can't replicate data correctly without the metadata).
The frame takes less space than *two* [RFC4122 UUIDs][rfc4122]; but it contains *twelve* UUIDs (6 distinct UUIDs, 3 distinct timestamps) and also the data.
The point becomes even clearer if we add the object UUID to JSON using the RFC4122 notation:
```
{"_id": "0651a600-2b49-11e6-8000-1696d3000000", "keyA":"valueA", "keyB":"valueB"}
```

We may take this to the extreme if we consider the case of a CRDT-based collaborative real-time editor.
Then, every letter in the text has its own UUID.
With RFC4122 UUIDs and JSON, that is simply ridiculous.
With RON, that is perfectly OK.

Consider "Hello world!" collaboratively written by two users, `bart` and `lisa` on 27 Nov 2017 around 9am GMT.
A compressed RGA (Replicated Growable Array) frame would look like:
```
*rga#1UQ8p+bart@1UQ8yk+lisa!
    @(s+bart'H'@[r'e'@(t'l'@[T'l'@[i'o'
    @(w+lisa' '@(x'w'@(y'o'@[1'r'@{a'l'@[2'd'@[k'!'
```
The `txt` mapper may convert the RGA frame into text:
```
*txt #1UQ8p+bart @1UQ8yk+lisa 'Hello world!'
```
If nicely indented, the compressed frame is easier to read:
```
*rga #1UQ8p+bart @1UQ8yk+lisa     !
                 @(s+bart        'H'
                 @[r             'e'
                 @(t             'l'
                 @[T             'l'
                 @[i             'o'
                 @(w+lisa        ' '
                 @(x             'w'
                 @(y             'o'
                 @[1             'r'
                 @{a             'l'
                 @[2             'd'
                 @[k             '!'
```
If fully uncompressed, the frame takes more space:
```
*rga   #1UQ8p+bart   @1UQ8yk+lisa     :0      !
*rga   #1UQ8p+bart   @1UQ8s+bart      :0     'H'
*rga   #1UQ8p+bart   @1UQ8sr+bart     :0     'e'
*rga   #1UQ8p+bart   @1UQ8t+bart      :0     'l'
*rga   #1UQ8p+bart   @1UQ8tT+bart     :0     'l'
*rga   #1UQ8p+bart   @1UQ8ti+bart     :0     'o'
*rga   #1UQ8p+bart   @1UQ8w+lisa      :0     ' '
*rga   #1UQ8p+bart   @1UQ8x+lisa      :0     'w'
*rga   #1UQ8p+bart   @1UQ8y+lisa      :0     'o'
*rga   #1UQ8p+bart   @1UQ8y1+lisa     :0     'r'
*rga   #1UQ8p+bart   @1UQ8y1a+lisa    :0     'l'
*rga   #1UQ8p+bart   @1UQ8y2+lisa     :0     'd'
*rga   #1UQ8p+bart   @1UQ8yk+lisa     :0     '!'
```

If rendered in JSON, the same document would probably start as
```
{
    "_id": "3b127800-d350-11e7-8000-9a5db8000000",
    "_version": "98f38f80-d351-11e7-8000-c2dde5000000",
    ...
```
...which is already 90% of the size of the entire compressed frame above.
With idiomatic JSON, per-symbol metadata is both difficult and expensive.

So, let's be precise. Let's put UUIDs on everything. RON makes it possible.

## Wire format (binary)

The binary format is more efficient because of higher bit density; it is also simpler and safer to parse because of explicit field lengths. Obviously, it is not human-readable.

Like the Base64, the binary format is only optimized for iteration. Because of compression, records are inevitably of variable length, so random access is not possible. Also, compression depends on iteration, as UUIDs get abbreviated relative to preceding UUIDs.

A binary RON frame starts with magic bytes `RON ` (R-O-N-space) and frame length, a little-endian uint32, 8 bytes total. (For multiframes, the magic bytes are treated as a Base64 number, first frame having `RON0`, second `RON1` and so on.)

On the inside, a frame is a sequence of *fields*.
Each field starts with a *descriptor* byte.
A descriptor byte spends two most significant bits for a field type, next two bits for a sub-type and four bits for field byte length (excluding the descriptor byte, starts with 0).
Length of 13, 14 or 15 means the descriptor byte is followed by the actual length as a little-endian uint8, uint16 or uint32, respectively.
Descriptor byte types and sub-types are as follows:

0. `00` Op  - the length is either 0 or the byte length of all the op's fields, excluding the descriptor byte.
    * `0000` raw op subtype,
    * `0001` reduced op,
    * `0010` header op,
    * `0011` query header op.
1. `01` UUID value
    * `0100` type (reducer) id,
    * `0101` object id,
    * `0110` event id,
    * `0111` ref/location id
2. `10` UUID origin
    * `1000` name UUID,
    * `1001` hash UUID,
    * `1010` event UUID,
    * `1011` derived event UUID.
3. `11` Atom
    * `1100` UUID value (optinally followed by `10??` origin)
    * `1101` integer (little-endian int64)
    * `1110` string (...)
    * `1111` float (IEEE 754-2008, binary 16, 32 or 64, lengths 2, 4, 8 resp)

UUID coding is as follows:
* value (`0100`..`0111`, also `1100`) and origin (`1000`..`1011`) are encoded as separate fields,
* a skipped field means "same as the default",
* field length is 0..8 bytes (0 is same as a skipped field)
* UUID value/origin has 60 numeric bits encoded by 1..8 bytes (big-endian, also note the 8*8-60=4 extra bits)
* in the first byte, the most significant bit denotes a default flip (same as ` in the Base64 coding), next three bits specify the shared prefix length, in bytes (0..7)

For example, `0110 0001  1111 0100` is the value part `01` of an event UUID `10`, defaults to the object UUID of the same op `1` (flip bit), shares 7 bytes of prefix with the default `111`, the remaining 60-7*8=4 bits are `0100`.
As with the Base64 coding, we optimize for compression of close UUIDs (ideally, sequential UUIDs).

## The math

RON is [log-structured][log]: it stores data as a stream of changes first, everything else second.
Algorithmically, RON is LSMT-friendly (think [BigTable and friends][lsmt]).
RON is [information-centric][icn]: the data is addressed independently of its place of storage (think [git][git]).
RON is CRDT-friendly; [Conflict-free Replicated Data Types][crdt] enable real-time data sync (think Google Docs).

Swarm RON employs a variety of well-studied computer science models.
The general flow of RON data synchronization follows the state machine replication model.
Offline writability, real-time sync and conflict resolution are all possible thanks to [Commutative Replicated Data Types][crdt] and [partially ordered][po] op logs.
UUIDs are essentially [Lamport logical timestamps][lamport], although they borrow a lot from RFC4122 UUIDs.
RON wire format is a [regular language][regular].
That makes it (formally) simpler than either JSON or XML.

The core contribution of the RON format is *practicality*.
RON arranges primitives in a way to make metadata overhead acceptable.
Metadata was a known hurdle in CRDT-based solutions, as compared to e.g. [OT-family][ot] algorithms.
Small overhead enables such real-time apps as collaborative text editors where one op is one keystroke.
Hopefully, it will enable some yet-unknown applications as well.

Use Swarm RON!


## History

* 2012-2013: project started (initially, as a part of the Yandex Live Letters project)
* 2014 Feb: becomes a separate project
* 2014 Oct: version 0.3 is demoed (per-object logs and version vectors, not really scalable)
* 2015 Sep: version 0.4 is scrapped, the math is changed to avoid any version vector use
* 2016 Feb: version 1.0 stabilizes (no v.vectors, new asymmetric client protocol)
* 2016 May: version 1.1 gets peer-to-peer (server-to-server) sync
* 2016 Jun: version 1.2 gets crypto (Merkle, entanglement)
* 2016 Oct: functional generalizations (map/reduce)
* 2016 Dec: cross-columnar compression
* 2017 Jun: Swarm RON 2.0.0
* 2017 Jul: new frame-based Causal Tree / Replicated Growable Array implementation
* 2017 Jul: Ragel parser
* 2017 Aug: punctuation tweaks
* 2017 Oct: streaming parser
* 2017 Oct: binary encoding

[2sided]: http://lexicon.ft.com/Term?term=two_sided-markets
[super]: http://ilpubs.stanford.edu:8090/594/1/2003-33.pdf
[opbased]: http://haslab.uminho.pt/sites/default/files/ashoker/files/opbaseddais14.pdf
[cap]: https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed
[swarm]: https://gritzko.gitbooks.io/swarm-the-protocol/content/
[po]: https://en.wikipedia.org/wiki/Partially_ordered_set#Formal_definition
[crdt]: https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type
[icn]: http://www.networkworld.com/article/3060243/internet/demystifying-the-information-centric-network.html
[kafka]: http://kafka.apache.org
[git]: https://git-scm.com
[log]: http://blog.notdot.net/2009/12/Damn-Cool-Algorithms-Log-structured-storage
[re]: https://blogs.msdn.microsoft.com/csliu/2009/11/10/mapreduce-in-functional-programming-parallel-processing-perspectives/
[rfc4122]: https://tools.ietf.org/html/rfc4122
[causal]: https://en.wikipedia.org/wiki/Causal_consistency
[UUID]: https://en.wikipedia.org/wiki/Universally_unique_identifier
[peterb]: https://martin.kleppmann.com/2014/11/isolation-levels.png
[regular]: https://en.wikipedia.org/wiki/Regular_language
[mvc]: https://en.wikipedia.org/wiki/Model–view–controller
[ot]: https://en.wikipedia.org/wiki/Operational_transformation
[lamport]: http://lamport.azurewebsites.net/pubs/time-clocks.pdf
[2problems]: https://martinfowler.com/bliki/TwoHardThings.html
[lsmt]: https://en.wikipedia.org/wiki/Log-structured_merge-tree
