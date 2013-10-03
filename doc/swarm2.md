# Swarm: an object sync library

Swarm is a compact MVC library providing real-time syncable, cacheable
JavaScript objects for the new world of WebSocket, WebStorage and
WebRTC. All client/server replicas of an object form a dynamic
graph, exchanging deltas and merging changes the most efficient way.
Swarm is relativistic at its heart fully embracing the fact that
events originate at various points and spread asynchronously.  It
provides the minimal set of primitives that feel natural and close to
plain JavaScript but have rich syncing behaviour under the hood.

The vision behind Swarm is to get back to the good old days: program a
real-time multiuser multiserver app like a local MVC app, let things
automatically synchronize in the background. Ideally, once view
rendering is model event driven, there is hardly any difference in
reacting to either local or remote changes.

### Swarm and Backbone

Swarm is a breed of [Backbone][bb] and a real-time peer-to-peer object
synchronization algorithm. Our intent was to depart from the Backbone
way iff only strictly necessary to ensure sync correctness.  Some
problems, such as garbage collection, became way more complicated in a
distributed setting so we introduced more structure to the
architecture to counter that. Another issue was supporting Backbone
collections which are essentially arrays.  Unfortunately, sequential
structures cause a lot of trouble in a concurrent system so Swarm
employs `{key:object}` Sets instead. Some issues, to the contrary, got
easily resolved. For example, Backbone does not assume reliable object
ids. Swarm objects have permanent lifetime ids provided by the
synchronization model so `model.cid` and `view.el` became unnecessary.
The option of client-to-client synchronization and
client-server-server-client operation relay led to client/server logic
convergence. We assume that the server runs some version of Swarm as
well. We also assume that the DB backend keeps records with their
version ids attached.

Swarm targets the broad class of applications that score high on the
following checklist:

* benefit from multiuser collaboration or multidevice syncing,
* benefit from offline work and direct device-to-device syncing,
* need realtime syncing, probably peer-to-peer (WebRTC),
* where users interact with objects repeatedly, as opposed to
  read-and-goodbye Web sites.

Two biggest classes are team collaboration apps and online games.

[bb]: http://backbonejs.org/


## Architecture


The hourglass waist of the Swarm architectire is the sync protocol
based on formally precise and unique identifiers assigned to every
event in the system.  Above the waist, there might be various
server/client logic implementations synchronizing by the protocol and
forming heterogenous "swarms" (e.g. see full vs stateless server
discussion).  Below the waist, there are various possible
transport/storage technologies, such as:

* WebSocket as the default browser-to-server transport,
* TCP as a minimal-overhead server-to-server transport,
* WebRTC as a minimal-RTT client-to-client transport,
* postMessage as a iframe-to-iframe transport,
* WebStorage as a tab-to-tab transport,
* WebStorage as the default client-side key-value storage,
* leveldb as a minimalistic server-side storage,
* MySQL as a relational server-side storage,
* MongoDB as as a NoSQL server-side storage,
* and so on and so forth.

As an example of flexibility "above the waist", imagine a virtual
"class" having some methods implemented in JavaScript and others in
Java. As long as calls are correctly forwarded to a JavaScript or Java
process respectively, it should work.

Swarm employs *specifiers* to formally describe any event in the system.
Specifier is a compound identifier consisting of tokens, such as:

* object id, 
* class of the object,
* field or method within the object,
* timestamp of the event,
* author of the event.

Note that the `(timestamp,author)` pair forms a classic *logical
clock* defining a partial ordering (and an arbitrary total order) for
all events related to a given atom (field or method). Such an order is
used to merge changes in distributed replicas without resorting to
Dark Arts, a.k.a. [Operational Transformation][ot]. That is especially
valuable as we allow for heterogenous servers and client-to-client
direct synchronization.

[ot]: http://en.wikipedia.org/wiki/Operational_transformation

A serialized specifier is a plain ASCII string which looks like:

    /Class#objectID.field!timestamp&author

Apart from change serialization and storage, specifiers are used for
various support missions like e.g. assigning ids to DOM elements to
avoid direct links from objects to DOM (way better for gc).

### Sync protocol

Wire protocol talks in `{specifier: json_value}` pairs aka specvals.
A typical spec-value pair for a field change looks like:

    /TodoItem#milk.text!20130923100022&gritzko   "buy some milk"

Note that the timestamp `!20130923100022` means 2013 Sep 23 10:00:22.
A typical remote method invocation may look like:

    TodoItem#milk:share!20130923100025&gritzko  {
        "email":    "milk@shop.com"
    }

It is assumed that specvals spread to replicas without reordering.
The actual serialization format is a point-to-point convention, most
straightforward option being JSON. Storage/caching implementations may
employ the same specval format as well.

An object's replicas form a spanning tree by forming bidirectional
subscriptions.  A downlink replica initiates a subscription to its
uplink and the uplink replica subscribes back. Unsubscription proceeds
the same way. Once a change is received, a replica sends it to every
subscriber but the source. RPC method calls are sent to the uplink
only to reach the tree root where they are executed.

When subscribing to an object, an initiator forwards versions of
recentmost changes it already knows. The responder sends back any
later changes if known. A simple one-way subscribe exchange may look
like:

    >>> /TodoItem#milk*on   {"&gritzko": "!20130923090020"}
    <<< /TodoItem#milk.text!20130923100022&gritzko   "buy some milk"

### Swarms

The swarm is organized in a way so all the replicas of a given object
should form a spanning tree. Updates (diffs and method calls) are
forwarded along the edges. Normally, the database storing the object
is the root of the tree. The simplest topology of the kind is:

* every server process being connected to every other server,
* every client being connected to some server,
* every server being responsible for a fraction of objects according
  to a [consistent hashing][ch] scheme.

Then, replicas of the same object may form a spanning tree using the
responsible server as the root and a kind of a rendez-vouz point.
Only the responsible server talks to the database to minimize
concurrency.  A spanning tree is optimal in terms of messages sent to
synchronize all the replicas.  This kind of topology is rather robust
to temporary disruptions that cause the server mesh to become
incomplete. Temporarily, some spanning trees become fragmented or
suboptimal, then it settles back.  Once leaf nodes (e.g.  clientside
JavaScript) create new replicas, the spanning tree grows. Once clients
disappear or release replicas, the tree shrinks.

[ch]: http://en.wikipedia.org/wiki/Consistent_hashing

### Full vs stateless sync servers

Swarm server implementations can be of three broad categories:

* stateless servers forward updates without caching any data,
* caching servers keep the state of all the replicas listened to so
  they can boot new replicas without a DB read,
* full servers keep objects in RAM so all the methods may be called.

In principle, all three types are transparently interoperable. Caching
servers may store JSON as plain strings, stateless servers would
repeatedly subscribe to the same object to fetch-and-forward the
state, but generally all the differences are hidden behind the
interface.

Obviously, non-full servers cannot execute any methods. There are two
options here: either to forward all the calls to a separate group of
"RPC servers" or (not always possible) simply store call log in the
storage so a client may catch up with the log once the object is
fetched. Swarm clients are by definition full except for remote
methods that are proxied to servers. See further discussion on RPC vs
logged methods below.

Obviously, stateless servers scale better than caching, caching better
than full. A full server in Java likely scales better than a JavaScript
implementation.


## Swarm objects


Swarms extends JavaScript objects more or less the same way as
Backbone does.  Objects of a class may be either versioned as a solid
piece or use fine-grained per-field versioning. The latter is
preferred for bigger objects. All version metadata is kept in the
`_vid` field. It is either a `String` containing the object's version
specifier or an `Object` containing a `{field: specifier}` map. A
version specifier (vid) looks like `!20130923100022&gritzko`.

### Synced vs unsynced fields

A class may have synced and unsynced fields. Synced
fields are assigned using `set` methods, e.g. `set("field",true)` or
`setField(true)`. Every change to a synced field generates a *version*
that propagates to other replicas in real time. A typical sequence of
events is like:

* a user clicks the checkbox
* a jQuery event fires that invokes `milk.setDone(true)`
* that turns into `this.set('done',true)`
* that creates a version `!20130923100022&gritzko` for the object
* which change serializes as  
  `/TodoItem#milk.done!20130923100022&gritzko    true`
* the specval pair is sent by a WebSocket connection to a server
* the server forwards the change to other clients
* the server turns the change into an SQL update  
  `UPDATE TODOITEMS  
      SET DONE=TRUE, VID="!20130923100022&gritzko"  
      WHERE ID="milk"`

That way, todo items get cheap last-writer-wins real-time
synchronization without any merge of concurrent changes, which are
unlikely in this particular app. The per-field versioning option may
enable merges but SQL storage overhead will become significant then.

Unsynced fields are not synchronized in real time. Those are supposed
to be a function of synced fields, sort of a cache.  Unsynced fields
are copied on replica initialization. Later, they are updated in
reaction to changes of synced fields (being a cache of some
calculation, essentially) or modified by logged methods (see below).
Generally, unsynced fields are rather volatile, correctness being
responsibility of the implementation. Their role is like UDP in the
TCP-UDP duo; merely an option to implement your own behavior.

### Set vs Object

Like in general JavaScript, Swarm keeps differences of regular objects
and sets/maps rather subtle. Essentially, that is a flag
`Constructor.prototype.isSet` that switches between two modes. While
objects have a list of synced fields, every field of a set gets
synchronized. Sets are suposed to contain `{key: object_id}` pairs,
although that is not mandatory.  On the wire, set synchronization
proceeds exactly the same way by sending specval pairs.

The special trick about a Set is to use it as a container of objects.
The `fill()` method scans all the fields, picks values that are valid
specifiers (like `/TodoItem#milk`), loads corresponding objects
asynchronously and puts them as values into the set. Although,
`fill("field")` may be invoked on objects in exactly the same fashion.
Generally, objects and their ids are used interchangeably.

The semantics of a sorted collection is implemented by sorting
key-object pairs based on their keys.

### Methods: RPC, logged, local

The section on synchronizing fields was a no-brainer: those are either
synchronized or not. Syncronizing and remotely invoking methods allows
for plethora of behaviors:

* *local* methods need no replication,
* *RPC* methods execute on the server side,
* *logged* methods need to be executed on every replica,
* *self-listeners* react on changes of synced fields. 

Logged methods and self-listeners are more of an advanced topic as
their access to synced/unsynced fields needs to obey some rules.  As
well, they are sensitive to operation order issues. They need either
to be order-agnostic (within limits of the partial order), or handle
reorderings manually.  Local and RPC methods are simpler concepts
having straightforward effects.  By default, a method is considered
local. RPC, logged methods and self-listeners are either listed in
`Swarm.Model.extend()` or later registered with `Swarm.Model.addMethod()`.

All method calls are serialized exactly the same way as field mutations

    /TodoItem#milk:share!20130923100025&gritzko  {
        "email":   "milk@shop.com"
    } 

storing call log  by the same machinery

### Logged methods

Synchronization is not necessarily performed on a field-by-field
basis. Logged methods implement the operational approach:

* every replica is booted with JSON state,
* every replica is delivered operations that were later performed on
  that state,
* operations may arrive reordered, still obeying some partial order,
* once all the operations are distributed to all the replicas, states
  of replicas must be identical.

Convergence of replicas depends entirely on the implementation. Swarm
only provides logging and distribution of operations. The operation
log is essential as it guarantees that every replica will be replayed
all the operations eventually. Logged method calls are stored, queued,
distributed and invoked in a manner that is more similar to field
synchronization than to RPC calls.

Logged methods are useful for implementing collaborative text editing,
for example. Every major collaborative editing approach (diff-patch,
OT, WOOT/CT) represents a text as a stream of edit operations replayed
on every replica.

### Self-listeners and derived fields

As replica states are supposed to stay in sync, unsynced fields are
generally expected to be functions of synced fields and logged
methods. One may react to changes in synced fields by adding static
self-listener methods; those are similar to regular `on('field',fn)`
listeners except they are methods added to every object of a class.
As an example:

    Bar.on('height width depth', function () {
        this.volume = this.getHeight()*this.getWidth()*this.getDepth();
        this.mass = this.getDensity() * this.volume;
    });

While dimentions and density values get synced, volume and mass are
calculated.

An advanced usage pattern is to use compound specifiers when adding a
static listener. A specifier filters events in a more complex way than
simply by an event name (i.e. field or method).

    TodoItem.on('&joe', function (key,val,spec) {
        console.log("Joe changed something");
    });

    var milk = TodoItem.objects['#milk'];
    milk.on('.toggle', function (key,value) {
        console.log('milk is '+(value?'done':'undone'));
    });

    Swarm.on('/TodoItem.toggle&joe', function(key,val,spec){
        val && console.log('Joe did '+Spec.as(spec).id);
    });

That generalizes the well-known practice of semicolon based event name
scoping used in jQuery, Backbone and others. Differently from other
libraries, Swarm event buses are interconnected. Attaching a listener
to an object is the same as attaching it to the Swarm singleton while
specifying the class and the object id; attaching to a class object is
the same as specifying the class. The following examples are
equivalent:

    milk.on('done', fn);
    milk.on('.done', fn);
    TodoItem.on('#milk.done', fn);
    Swarm.on('/TodoItem#milk.done', fn);

The same applies to the `set` method. The following examples are all
equivalent:

    milk.setDone(true);
    milk.set('done',true);
    milk.set('.done',true);
    TodoItems.set('#milk.done', true);
    Swarm.set('/TodoItems#milk.done', true);
    // we assume it is 30 Sep 2013 12:01:49
    Swarm.set('/TodoItems#milk.done!20130930120149&gritzko', true);

As an opposite example, an empty event name subscribes to every event
in the context. `Swarm.on('',fn)` will make `fn()` invoked on every
event. That is good as a last-resort debugging technique.

### Views and cache

Swarm's top requirement for the View is the ability to render HTML on
the client and server side alike. Thus, it employs Backbone-like
fine-grained templates, not annotations or declarative bindings.  The
default implementation uses Underscore templates with some additional
features to facilitate recursive templating.  An important upside of
the approach is that rendered views are easily cached as HTML.  Still,
that simple 20/80 default implementation can always be overriden.

Every rendered template is wrapped into a container `DIV` that has the
respective specifier as its id, e.g. `/TodoItemView#milk`. Generally,
handling HTML in uniform containers is much handier. Also, that way we
avoid direct links from model to DOM that hinder garbage collection.
Decoupling of View and DOM is also good for server-side rendering.

The most simple view implementation is instantiated as  
`var TodoItemView = Swarm.View.extend(TodoItem,templateString)`.

### Access control

In the land of access control, an inevitable paradigm shift is caused
by the fact we allow client-to-client communication. A straightforward
consequence is that we need in-depth defence policies enforced by
every peer, which is way beyond typical check-on-submit validation.
Hence, every replica must check access rules when applying any change,
be it received from a server or another client or picked up from a
stored log.

The default access mode is to allow read access to everyone who knows
the id, while write rights are restricted to the object's creator.
Explicit access policies are stored in the `_acl` field of an object.
The default implementation expects it to be a space-separated list of
user ids and rights, like `"admin:a joe:w default:r"`. 
More sophisticated policies might be implemeted by overloading
`Swarm.getPermissions(id|object, user_id)` which is expected to
return one of:

* `a` - admin rights, i.e. read-write access to any field, incuding
  dot-fields,
* `w` - write rights to regular fields,
* `r` - read rights to regular fields,
* `''` - no rights.


## API

Either spec,val or {spec:val}

### Swarm singleton object

* `connect([uri])`
* `getUplink(spec)`
* `getPermissions(spec, user_id)`

#### Swarm.Model

* `extend(prototype|constructor)`
* `addField(constructor,name)`
* `addMethod(constructor,name,type[,function])`
* `addRPCMethod(constructor,name[,function])`
* `addLoggedMethod(constructor,name[,function])`

#### Swarm.View

* `extend(prototype|constructor)`

### Object mixin

* Methods
    * `on(field|method, handler)` or `addListener(field,handler)`, also
      `one()`, `once()`; invokes `handler(field,value,spec)` when
      `field` changes or `method` is invoked; `one`/`once` work once
    * `off(event,handler)`
    * `set(field,value)`
    * `get(field)`
    * `fill(field)`
    * `spec(field?)` returns the specifier for the object/field
* Per-field convenience methods
    * `setField(value)` equals `set('field',value)`
    * `getField()`, equals `get('field')`
    * `onFieldChange(handler)` equals `on('field',handler)`
    * `offFieldChange(handler)`
* Static functions (TodoItem.xxx)
    * `on`
    * `off`
    * `getUplink(id)` defaults to `Swarm.getUplink(spec)`
    * `getPermissions(spec, user_id)` defaults to `Swarm.getPermissions(spec,uid)`
* Special fields
    * `_id`
    * `_lstn`  `_lstn[0]` is always the uplink
    * `_acl`

### Overriding behavior

Note that WebStorage is a transport, not storage :)

* Storage
    * `get([spec])` semantics may vary for partial specifiers
    * `set(spec,value)`
* Transport
    * `constructor(uri)`
    * `send()`
    * `on('message',fn)`
    * `Swarm.openXXXChannel(uri,callback)` - special cases
* Load distribution
    * `Swarm.getUplink(spec)`
* Access control
    * `Swarm.getPermissions(id|object, user_id)`
    * TODO transport filtering

### Examples

    TodoItem = Swarm.Model.extend({
        syncedFields: {
            title: '',
            completed: false
        },
        loggedMethods: {
            toggle: function () {
                this.setCompleted(!this.getCompleted());
            }
        }
    });
    TodoItemView = Swarm.View.Extend({
        model:          TodoItem,
        template:       some_html,
        events: {
            'click .todo_toggle': 'toggle'
        }
    });

    TodoList = Swarm.Set.extend(TodoItem);
    TodoListView = Swarm.View.extend(TodoList);


    // Browser
    // recommend auth cookies
    Swarm.connect();
    var view = new TodoListView('#login');
    view.plant(document.body);

    var todos = Swarm.once('/TodoList#login', function(keyval,spec) {
        // this===todos
        todos.fill();
    });

