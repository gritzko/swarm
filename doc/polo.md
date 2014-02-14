# Citrea and Swarm: partially ordered op logs in the browser

This paper briefly describes our experiences and findings made while
implementing an in-browser collaborative editor Citrea and a real-time
JavaScript object sync library Swarm.js.

Partially ordered log of immutable operations (POLO) is a known
approach in the eventual consistency land. Normally, POLO is employed
by large scale systems once operation log linearization becomes
unfeasible (e.g.  Apache Cassandra). We had some experience applying
POLO at a smaller scale, namely to a real-time collaborative editor
system, where a "dataset" is just a single document. Indeed, a
collaborative editor faces the same issues "large" systems face, but
for a different reason. In a "large" system, due to its scale, at any
moment some components fail. At the same time, bringing all the
transactions to a single point for linearization is not feasible
due to their volume.  Hence, such systems adopt some form of
eventual consistency, sometimes POLO.

In a collaborative editor, users exchange edits in real time over
potentially faulty high-lag end-user links. That leads to the same
problem: linearization is impossible, so changes have to be applied to
different replicas in different orders. The established approach to
the problem is Operational Transformation, a theory of rewriting
operations in flight to retrofit them to de-facto orderings. OT has a
reputation for complexity of understanding, development and use.
Because of our modest numbers, we chose the more deterministic POLO
approach.  Citrea decomposes a document into a stream of "atomic"
edits (same as OT), but these operations are immutable all the way
along. Instead, change merge algorithms adapt to the fact that orders
might vary slightly from replica to replica, (as long as) no causality
violations are allowed.

The key enabler of our approach was proper unique identification of
events using logical clocks (also known as Lamport timestamps).  Once
reliably identified, events can be exchanged, cached, stored, ordered
and, most importantly, can reference other events thus forming a
[causal][causal] structure.  That saved us from volatile positional
addressing OT relies on. Further on, we had to extend the classic
toolset with a more powerful concept of a "specifier". As our apps
exchange fine-grained changes in real time, we had to concisely
describe the context of every small change as it is likely to be
delivered, processed and stored separately from the rest of the
related state.

In our "reactive" interpretation of object-oriented programming, the
state is still encapsulated by objects. Every change of state must be
wrapped as a "method", which is almost synonymous to "change",
"operation" and "event".  Every method invocation is assigned a
Lamport timestamp and asynchronously propagated to other replicas
(like an op). At the same time, every method can be listened to (as an
event).  For every atomic operation, a specifier contains its class,
object id, method name and, most importantly, its Lamport timestamp
which is local time plus replica id.  In practice, a serialized
specifier looks like:

`/TodoItem#PaPEC!7AMTc+gritzko~e4.done`

where `!7AMTc` is a Base64 timestamp for `22 Oct 2013 08:05:59 GMT`,
`gritzko~e4` is the author/replica id, `TodoItem` and `done` are class
and method names respectively.  So, every method invocation is
serialized into a 3-parameter signature of the event's *specifier*,
*value* (method parameters) and *source* (essentially, a callback). As
this programming model is inherently asynchronous, a method can not
simply return a value or throw an exception the regular way, so any
returns are supplied back to the source through the callback.

This programming model may be described as uber-reactive and even
(tongue-in-cheek) "reactionary" as we do our best to program extremely
distributed concurrent systems more or less the way we programmed good
old local MVC apps. The issues of eventual consistency are isolated
inside a distributed event bus. The bus delivers events to replicas
asynchronously, leaving other steps of the MVC cycle more or less
the same.

The advantage of the approach we enjoyed the most, apart from the fact
that it works, is the fact that it works well offline and under
intermittent connectivity.  It is sufficient for replicas to exchange
"patches" time to time. Correct POLO synchronization is possible to
interrupt, but impossible to break as long as causality order is
maintained, which practically amounts to TCP-like in-order delivery
guarantees in most cases.  The design is generally intuitive and
understandable, as opposed to OT.

The top shortcoming of POLO is the overhead of running a live replica
of the model at the client, including a significant portion of the
logic, as opposed to flattened results/views (like in classic Web
apps) or a proxied dataset (like in e.g. Meteor). That is likely an
inevitable price to pay for responsive and offline-ready apps.

From the point of view of an implementer, predictably the most
difficult situation is a "blast from the past"; once a batch of
changes arrives from a re-connected client, it needs to be merged into
a replica. Algorithms tend to be application-dependent and that, in
particular, prevents us from implementing POLO stack at the database
layer (unless we are ready to tolerate version forks, like in
CouchDB/pouchdb or git).  Our approach was to leave the storage layer
"dumb" and generic.  Operations expressed as specifier-value pairs are
conveniently stored in any key-value storage, including HTML5
WebStorage.  On top of the storage goes the general POLO layer
implementing "difficult" routines: handshakes, resynchronization,
version vectors, op log maintenance and suchlike.  On top of that goes
application-dependent POLO logic, including the actual "payload" logic
of operations, merge algorithms and state maintenance.  Given that
all, an implementer may write the rest of an app in the regular MVC
fashion, which was the objective.

[cassandra]: http://www.datastax.com/docs/0.8/dml/about_writes
[causal]: http://bouillon.math.usu.ru/articles/ctre.pdf
