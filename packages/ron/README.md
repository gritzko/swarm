# Swarm Replicated Object Notation 2.0.0 #
[todo]: [*see on GitBooks: PDF, ebook, etc*](https://gritzko.gitbooks.io/swarm-the-protocol)
see https://github.com/gritzko/swarm-ron-docs/tree/2.0

Swarm Replicated Object Notation is a distributed data serialization format.
Implicitly, formats like XML or JSON assume a lump of state being delivered from a server to a client -- once and in one piece.
RON aims to synchronize *replicas* by delivering a stream of changes -- continuously and incrementally.
With RON, even an object's state is seen as a batch of compacted changes, with more changes coming.

In the RON world, the source of truth is not some central storage, but a swarm of devices, each producing and processing data continuously.
These devices cache their data and synchronize it in real time over faulty channels.

Consider JSON. It expresses relations by element positioning:
`{ "foo": {"bar": 1} }` (inside foo, bar equals 1).
RON may express that state as:
```
.lww#time1-userA`   :bar=1
#root@time2-userB   :foo>time1-userA
```
Those are two RON *ops*.
First, some object has a field "bar" set to 1.
Second, another object has a field "foo" set to the first object.
RON ops are self-contained and context-independent.
Each change is versioned and attributed (e.g. at time `time2`, `userB` set `foo` to `time1-userA`).

With RON, every #object, @version, :location or .type has its own explicit [UUID](uid.md), so it can be referenced later unambiguously.
That way, RON can relate pieces of data correctly.
Suppose, in the above example, `bar` was changed to `2`.
There is no way to convey that in plain JSON, short of serializing the entire new state.
Incremental RON updates are straightforward: `.lww#time1-userA@time3-userA :bar=2`. If compressed: ```.lww#time1-userA`(3:bar=2```.

Thanks to that UUID metadata, RON can:

* serialize complex data graphs (beyond simple nesting),
* maintain caches (thanks to object UUIDs),
* perform incremental data updates (thanks to version UUIDs),
* do offline writes (UUIDs are coordination-free),
* resolve conflicts (using Last-Write-Wins, CRDT or other strategy),
* blend data from different sources (UUIDs are global),
* overcome network failures (UUIDs enabe acknowledgements and idempotency),
* ...and so on and so forth.

One may say, what metadata solves is [naming things and cache invalidation][2problems].
What RON solves is compressing that metadata.

RON makes no strong assumptions about consistency guarantees: linearized, causal-order or gossip environments are all fine.
Once all the object's ops are propagated to all the object's replicas, replicas converge to the same state.
RON formal model makes this process correct.
RON wire format makes this process efficient.


## Formal model

Swarm RON formal model has four key components:

1. an [op](op.md) is an atomic unit of data change
    * ops are context-independent; an op specifies precisely its place, time and value
    * ops are immutable once created
    * ops assume [causally consistent][causal] delivery
    * an op is a tuple of four [UUIDs](uid.md) and one or more constants ([atoms](op.md)):
        1. the data type UUID,
        2. the object's UUID,
        3. the op's own event UUID,
        4. the location UUID,
        5. constants are strings, integers, floats or references ([UUIDs](uid.md)).
2. a [frame](frame.md) is a batch of ops
    * an object's state is a frame
    * a "patch" (aka "delta", "diff") is also a frame
    * in general, data is seen as a [partially ordered][po] log of frames
3. a [reducer](reducer.md) is a RON term for a "data type"
    * a [reducer][re] is a pure function: `f(state_frame, change_frame) -> new_state_frame`
    * reducers define how object state is changed by new ops
    * reducers are:
        1. associative,
        2. commutative for concurrent ops,
        3. optionally, idempotent.
4. a [mapper](mapper.md) translates a replicated object's inner state into other formats
    * mappers turn RON objects into JSON or XML documents, C++, JavaScript or other objects
    * mappers are one-way: RON metadata may be lost in conversion
    * mappers can be pipelined, e.g. one can build a full RON->JSON->HTML [MVC][mvc] app using just mappers.

RON implies causal consistency by default.
Although, nothing prevents it from running in a linearized [ACIDic][peterb] or gossip environment.
That only relaxes (or restricts) the choice of reducers.

## Wire format

Design goals for the RON wire format is to be reasonably readable and reasonably compact.
No less human-readable than regular expressions.
No less compact than (say) three times plain JSON
(and at least three times more compact than JSON with comparable amounts of metadata).

The syntax outline:

1. constants follow very predictable conventions:
    * integers `1`
    * e-notation floats: `3.1415`, `1e+6`
    * UTF-8 JSON-escaped strings: `"строка\n线\t\u7ebf\n라인"`
    * UUIDs `1D4ICC-XU5eRJ 1D4ICCE-XU5eRJ`
2. UUIDs use a compact custom serialization
    * RON UUIDs mostly correspond to v1 UUIDs (128 bit, globally unique, contains a timestamp and a process id)
    * RON UUIDs are Base64 to save space (compare [RFC4122][rfc4122] `123e4567-e89b-12d3-a456-426655440000` and RON `1D4ICC-XU5eRJ`)
    * also, RON UUIDs may vary in precision, like floats (no need to mention nanoseconds everywhere)
3. serialized ops use some punctuation, e.g. `.lww #1D4ICC-XU5eRJ :keyA @1D4ICC2-XU5eRJ "valueA"`
    * `.` starts a data type UUID
    * `#` starts an object UUID
    * `@` starts an op's own event UUID
    * `:` starts a location UUID
    * `=` starts an integer
    * `"` starts and ends a string
    * `^` starts a float (e-notation)
    * `>` starts an UUID, UUID array or a version vector (same format)
    * `!` marks a frame header
    * `?` marks a query header
4. frame format employs cross-columnar [compression](compression.md)
    * repeated UUIDs can be skipped altogether ("same as in the last op")
    * RON abbreviates similar UUIDs using [prefix compression](compression.md), e.g. `1D4ICCE-XU5eRJ` gets compressed to `{E` if preceded by `1D4ICC-XU5eRJ`

Consider a simple JSON object:
```
{"keyA":"valueA", "keyB":"valueB"}
```
A RON frame for that object will have three ops: one frame header op and two key-value ops.
In tabular form, that frame may look like:
```
type object         event           location value
-----------------------------------------------------
.lww #1D4ICC-XU5eRJ @1D4ICCE-XU5eRJ :0       !
.lww #1D4ICC-XU5eRJ @1D4ICCE-XU5eRJ :keyA    "valueA"
.lww #1D4ICC-XU5eRJ @1D4ICC1-XU5eRJ :keyB    "valueB"
```
There are lots of repeating bits here.
We may skip repeating UUIDs and prefix-compress close UUIDs.
The compressed frame will be just a bit longer than bare JSON:
```
.lww#1D4ICC-XU5eRJ`{E! :keyA"valueA" @{1:keyB"valueB"
```
That is impressive given the amount of metadata (and you can't replicate data correctly without the metadata).
The frame takes less space than *two* [RFC4122 UUIDs][rfc4122]; but it contains *twelve* UUIDs (6 distinct UUIDs, 3 distinct timestamps) and also the data.
The point becomes even clearer if we add the object UUID to JSON using the RFC4122 notation:
```
{"_id": "0651a600-2b49-11e6-8000-1696d3000000", "keyA":"valueA", "keyB":"valueB"}
```

We may take this to the extreme if we consider the case of a CRDT-based collaborative real-time editor.
Then, every letter in the text has its own UUID.
With RFC4122 UUIDs and JSON, that is simply ridiculous. That is painful to imagine!
With RON, that is perfectly OK.
So, let's be precise. Let's put UUIDs on everything.

## The math

RON is [log-structured][log]: it stores data as a stream of changes first, everything else second (think [Kafka][kafka]).
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

* 2012-2013: started as a part of the Yandex Live Letters project
* 2014 Feb: becomes a separate project
* 2014 October: version 0.3 is demoed (per-object logs and version vectors, not really scalable)
* 2015: version 0.4 is scrapped, the math is changed to avoid any version vector use
* 2016 Feb: version 1.0 stabilizes (no v.vectors, new asymmetric client protocol)
* 2016 May: version 1.1 gets peer-to-peer (server-to-server) sync
* 2016 June: version 1.2 gets crypto (Merkle, entanglement)
* 2016 October: functional generalizations (map/reduce)
* 2016 December: cross-columnar compression
* 2017 May: Swarm RON 2.0.0

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
