# Swarm: a node.js data sync library

Swarm is a minimal M(VC) library that focuses on synchronozed models,
i.e. JavaScript classes that magically synchronize between all your
clients and servers using WebSocket connections. All instances of an
object will form a dynamic spanning tree, of sorts, sending deltas to
each other and merging changes.
Regarding V and C parts of the MVC, you may either attach your own
View and Controller or insert Swarm into your MVC framework of choice
(like backbone.js).
The vision behind Swarm is to get back to the good old days: program
a real-time multiuser multiserver app like a local app, let things
automatically synchronize in the background.

## Architecture

We target an objective described by some as the Holy Grail of
JavaScript real-time apps[?].  With HTML5 and node.js, a server looks
more and more like a client: both run JavaScript, both have their own
storage.  Instead of synchronizing clients using stateless server-side
CRUD API layer or (even more antique) rendering all the stuff at the
server, we borrow some pages from peer-to-peer design books.  Servers
and clients form a single network to synchronize changes and serve
events without relying too much on the (database) backend.

In more general terms, when facing the specifics of real-time
applications we have two options.  Either serve update events from the
database layer (that is either pubsub and/or cache invalidation
techniques) or shift replica synchronization from the database upwards
to the application layer. We chose the latter. Again, our browser and
server processes form a single network to relay changes/events/rpc
calls to each other.

Our layer interaction model is like this:
  browser storage <=> browser <=> server <=> resp server <=> database

Our idea is to scale quick&dirty JavaScript logic (which is supposed
to be inherently unreliable) to larger setups using swarms of single
threaded node.js processes.

Our guiding principles:

* massive parallelism,
* reasonable redundancy and
* self-organization.

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
