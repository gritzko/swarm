# Swarm: a JavaScript object sync library

Swarm is a minimal library that magically synchronizes JavaScript
objects between all your clients and servers, in real-time. All
instances of an object will form a dynamic graph, exchanging deltas
the most efficient way and merging changes.  Swarm needs Node.js and
[einaros ws][ws] on the server side and HTML5 WebSocket in the browser.

The vision behind Swarm is to get back to the good old days: program a
real-time multiuser multiserver app like a local MVC app, let things
automatically synchronize in the background. Ideally, once view
rendering is model event driven, there is barely any difference
in reacting to either local or remote changes.

The Swarm is the M of MVC. Regarding V and C parts, you may either
attach your own View or Controller components (like [Handlebars][hb])
or insert Swarm into your MVC framework of choice (like
[Backbone.js][bb]).

[ws]: https://github.com/einaros/ws "Einar O. Stangvik WebSocket lib"
[hb]: http://handlebarsjs.com/ "Handlebars templating lib"
[bb]: http://backbonejs.org/ "Backbone.js MVC lib"

## Architecture

We target an objective described by some as the Holy Grail of
JavaScript real-time apps.  With HTML5 and node.js, server and client
sides converge: both run JavaScript, both have their own storage
and there is a continous two-way WebSocket connection between them.
The Holy Grail idea is to run the same codebase as needed either on
the server or on the client. In particular, we'd like to serve static
HTML from the server to make our site indexable. Further on, we'd like
to update HTML incrementally on the client. Once a user initiates an
event, we often need to relay that event to other users.  In bigger
setups, we also need to synchronize our multiple servers. Even at a
single server, multiple node.js worker processes often need some sort
of synchronization.

There are various ways of resolving those matters, which mostly boil
down to retrofitting the classic HTTP request-response architecture
which dates back to the epoch of Apache CGI, Perl scripts and RDBMS
backends. Instead, Swarm takes a fresh look at the problem, partially
by borrowing some pages from peer-to-peer design books.  Servers
and clients form a single network to synchronize changes and serve
events without relying too much on the (database) backend.

We assume that server processes and clients are unreliable alike.
Server processes connect to each other in P2P fashion, forming a full
mesh.  Servers may routinely join and depart, but dusruptions to the
mesh are temporary. A client connects to a server of his choice by
WebSocket.

Once a client opens an object, the request comes to the server.  The
server contacts another server which is the 'root' for that object.
The 'root' is assigned algorithmically, using consistent hashing.  The
root server conducts all DB reads and writes for the object to
minimize DB access concurrency.  Further on, all replicas of the
object at different servers will have to synchronize. Every change
will be serialized as a "diff" object. Diffs will propagate to all
replicas by a spanning tree where the root server will serve as the
root (tautology, right) and clients will be the leaves.
In case of topology disruptions, the spanning tree may temporarily
have more tiers.  Once some clients stop listening to an object, the
spanning tree contracts to the necessary minimum in a process that is
reminiscent of garbage collection, albeit at the swarm level.

***

*the remainder of the file is somewhat outdated*

## Signatures

We do our best to extend well-known conventions for method signatures
to the case of a distributed replicated object graph.

subscribe to object events:

    on(event,callback_fn)

swarm-scale garbage collection (swarm gc)

    off(event,callback_fn)

once all listeners are removed the object is garbage collected

    send(key,value)  // send({key:value})

"key" and "event" names are generalized as _specifiers_

    /collection#object.field!version
    /collection#object:method

don't be shocked once you encounter that in the debugger
Spec.to32(key) gives you

    /Mice#mouse1.x

which is way more readable

The same applies to the networking part
Basically, we extend the same send/on/off signature to a stack
of "pipes" that handle various aspects of network communication.
Pipes may be stacked, i.e. peer1 may be connected to peer2 by
a stack of pipes:

    BundlePipe // bundles on/off/send calls into spec-val objects
    JsonPipe // serializes on/off/send calls as JSON pieces
    LinePipe  // line-oriented format
    WebSocketPipe // sends/receives data by WebSocket
    TCPPipe // ...  by a raw TCP socket
    LocalPipe // for testing purposes
    WebStoragePipe // caches operations to WebStorage
    SocketIoPipe // socket.io

Example:

    websocket.on('connect', function(sock) {
        var net = new WebSocketPipe(sock);
        var json = new JsonPipe(net);
        var bundle = new BundlePipe(json);
        var cache = new WebStoragePipe(bundle);
        localPeer.addPeer(cache);
    });

## API

Our main building block is a synchronized JavaScript object that has
three key methods:

    on(id+event,fn) -- subscribe to an object with a given id
    off(id+event,fn) -- unsubscribe
    off(key,value) -- change an attribute

Objects also support mutation events:

    on(key,callback) -- start listening to object's attribute changes
    onKeyChange(newval,oldval) -- define this method to listen on for
    the event _every_ such object (static events)

Key internal Swarm methods:

    diff(version) -- get a difference from a given past version
    apply(diff) -- apply the diff to an object (merge, converge)
    version() -- get the current version of an object

To make your plain JavaScript object swarmable please call:

    Swarm.extend(PrototypeFunction)

Fire-and-forget RPC call (instead of opening an object locally):

    Swarm.call(PrototypeFunction,id,methodName,arguments)


## How it works

To understand how the entire library works it is the best to follow
the chain from one client setting a property of an object to another
client getting notified.

    // First, we define a prototype function (a constructor).
    // Make sure all the possible fields are initialized.
    function Prototype () {
        this.key = undefined;
        this._id = this._vid = undefined; // a useful optimization
    }
    // then we add Swarm-specific bits
    Swarm.extend(Prototype);
    // then we create a new empty object
    var obj = new Prototype();
    // Then we 'open' a partucular object by its id; for a new
    // object use falsy ids.
    obj.open(id,cb(objReady){
        // objReady===obj
        // here we may start setting values!
        objReady.set('key',value);
        // enough
        objReady.close();
    });

The code above is functionally equivalent to

    Swarm.call(Prototype,id,'key',value);

which does the same without replicating the entire object locally
(or any callbacks).

Once you do set(), that particular mutation gets a change id (vid)
assigned to it. Vids have a format of '!ts+seq&auth+ssn' where *ts* is
a 30-bit timestamp, *seq* (optional) is the serial number within a
second, *auth* is the code for the author of a change and *ssn*
(optional) is a session number for the author.  All object's vids are
stored in the obj.\_vid field.

In principle, all four vid fields are 30-bit integers, so it might
have been prudent to represent them as such letting v8 to optimize the
particular memory layout using its hashmap\<uint32_t,uint32_t\>
representation:
    { ts: 12345, seq: 23456, auth: 34567, ssn: 45678 }
Unfortunately, that v8 optimization needs to be triggered in v8, also
other JavaScript engines might not have it.  Instead we represent
every field as a pair of Unicode characters.  After all, vids are
created once, and then they are only (de)serialized and compared, so
the string representation is perfect as long as the alphanumeric order
matches the version order, which is the case.
Quite often, we use strings of concatenated vids to save some memory
overhead (the obj.\_vid field itself is the best example).

So, back to our mutation, once vid is assigned, it might be serialized
to the server. The format used is simply a subset of the very
straightforward JSON serialization of the object:

    { 
        "_id":  "someid",
        "_vid": "!ts+seq&auth+ssn",
        "key":  "value"
    }

In principle, you may get the same diff object manually by calling

    obj.diff(prev_obj_vid)

Using the WebSocket connection, this change gets sent to the server.
In the case of multi-server setups, the server forwards it to the
server _responsible_ for the object. The "responsibility" is split
among servers based on a consistent hashing scheme. The point is, that
all clients and all servers who open an object form sort of a spanning
tree where the 'responsible' server is the root. Once a server gets
killed or a server gets added, some proportion of spanning trees
rebuild themselves to use new roots.  Essentially, Swarm server nodes
form a loose DHT of sorts.  It is important that only the responsible
node reads/writes an object from/to the database. That is a cheap
way to resolve concurrent access issues.  Spanning trees have depth of
two (three if you count clients). In case of topology changes, trees
might increase their depth temporarily due to transient
inconsistencies, e.g. while the responsible node is not fully
connected yet.

So, finally some other server pushes the change to another client
which applies the change, triggering the static event:

    obj2.onKeyChange(value,oldvalue)

...which gets some caches recalculated and then regular event handler
which, probably, rerenders some view:

    obj2.on('key',function(newValue){
        some_view.render(newValue);
    });

The alternative was to do an RPC invocation at the original client
without checking out the entire object first. Then, events proceed
along the same lines, as the change will travel to the responsible
server, where it gets applied to an object and then it gets
redistributed to any other servers/clients which have that object
opened.

Both objects and changes might be cached in client storage to allow
for offline operation (and faster load times).
