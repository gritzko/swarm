# Swarm - JSON wire protocol

The mission of the Swarm protocol is to synchronize object replicas among client and server nodes. We put no requirement on the inner structure of nodes; the distinction between clients and servers is slim.
Clients connect to servers (mostly by WebSocket) and, potentially, to each other (by WebRTC). Servers, ideally, form a complete graph; every server is connected to every other one. Other topologies are possible as well. In the default scenario, for every given object, its replicas form a spanning tree to propagate updates the most efficient way. Ideally, the tree has depth of 3 (clients, edge servers, rendez-vouz servers). A rendez-vouz server for a given object is selected based on a consistent hashing scheme.
A distributed garbage collection algorithm contracts the tree as branches become unnecessary once clients depart or stop listening to the object. In most of the cases, the ultimate leaves of the replica tree are client-side DOM elements.

## Two-way subscription

The basic link holding the replica tree together is the two-way subscription. The pattern generalizes classic JavaScript event listeners and extends local event subscription to a distributed swarm.
Differently from channel-based subscriptions, a two-way subscription deals with an object. We assume that every replica of an object is both a source and a consumer of change events, so subscriptions are two-way and symmetric. Every action is presented on the wire as a specifier:value pair. Numerous pairs are grouped into maps. Assuming an exchange between two nodes, suppose node A subscribes to an object:

    {"/Class#object.on" : "!VerS1on+user~session"}

When subscribing, it specifies the already existing version to retrive any unknown changes. Node A responds with a fresh change:

    {"/Class#object.field!VerZn+user2~ssn" : "value"}

Immediately, node B sends a reciprocal subscription:

    {"/Class#object.reOn" : "!VerZn+user2~ssn"}

The only difference of reciprocal and initial subscriptions (`reOn` and `on` resp) is that initial causes reciprocal, but not the other way around.

The existing version of an object is specified as a version vector in a specifier-like format (see doc on specifiers). Namely, it is a concatenation of version identifiers of all the latest changes to the object made by respective processes.

    !VerS1on+jane~saf3!VerZn+joe~ffox4

(means a session `saf3` by user `jane` made a version `VerS1on`, a process by `joe` made `VerZn`; see doc on specifiers and timestamps)

Changes that are more than 1 hour older than the recentmost change may not be mentioned. It is assumed, that disruptions to the network topology do not last long so no concurrency is unresolved in 1 hour.

## Handshake

A handshake is what a connection starts with. Functions of a handshake are:

* authorization
* clock synchronization (for client nodes) 
* receiving a session number (for new client processes)

It is useful to clarify the difference between a "connection", a "process", a "session" and a "user". A *user* is an end user that has data, access rights, and so on. A *session* is some storage for object replicas that a user accumulates on some device. It may be an in-memory JavaScript object storage, a WebStorage or a database of any sort. A *process* is a non-interrupted control thread that runs on that storage. A *connection* is a network connection from one process to another, e.g. a WebSocket connection. The relation is one-to-many-to-many-to-many. One user may have many devices and thus sessions, many processes (eg browser tabs) may continue working with the same session (eg a WebStorage cached dataset). Due to intermittent internet connection, the same process may start many connections one after another.

The Swarm protocol does not perform authentication. In the case of WebSocket, that is normally done by a cookie. Swarm handshake is a "forced" subscription by the initiating process to its process metadata object:

    {"/Swarm#procTime+gritzko~ssnTime.on": "clientTime"} 

---

    {"/Swarm#time+author" : "connTime"}

---

The process object id mentions the user owning the process, the session id (a timestamp, normally) and a process id (also a timestamp). The process id has the same structure as standard Swarm version/obejct ids: `timestamp+author~session`.

The receiving process responds with a reciprocal subscription:

    {"/Swarm#procTime+gritzko~ssnTime.reOn": "srvTime"}

In case auth does not work or clocks diverge too far, the receiving process may respond with an `off`:

    {"/Swarm#procTime+gritzko~ssnTime.off" : "trueTime"}

Otherwise, the receiving process performs a symmetric handshake for its own process object:

    {"/Swarm#prcTime+swarm~ssn.on" : "srvTime"} 
    {"/Swarm#prcTime+swarm~ssn.reOn" : "clientTime"}

During the lifetime of the connection, process objects may be used for over-the-link messaging and reporting.
Generally, Swarm handshake follows the three-way handshake pattern of establishing a connection:

    >> on
    << reOn, on
    >> reOn

*Note* on parallel same-storage processes (eg two tabs open in the same browser). These are supposed to be synchronized first, eg by WebStorage change events. Otherwise, ensure there is only one, because the synchronization model assumes that changes from a single process come strictly in order.

### PEX (Peer EXchange)

Peer exchange is a gossip algorithm of P2P network origin. It assumes that peers report their peers to their other peers. The goal is to make a dynamic network more connected. In our case, we assume that some initial rendez-vouz processes are mentioned in the start-up configuration while every other newly joining process is gossiped.

To participate in the gossip, a process has to subscribe to a collection `/PEX#swarm` that mentions every living process id as eg `/Swarm#proc+swarm~ssn`. We assume that `swarm` is the name of the swarm (which is also the name of the "super user" server processes are working under).

## Updates

Once a one-way subscription is on, the receiving process starts sending update operations as spec-value pairs:

    {"/Class#object.field!vErsn+userX~ssn" : "value"}

By default, every process relays a change to every listener but the source that delivered the change in the first places. Oversimplifying a bit, as replicas form a spanning tree, where subscriptions are directed edges, that leads to efficient and fast propagation of an update. (The advanced topic is failure modes and tree builing/contraction, which is not covered here.)

## Unsubscription

Once a process stops listening to an object it sends an `off` message by every connection it was subscribed on:

	{"/Class#object.off" : ""}

There is also reciprocal `off`:

	{"/Class#object.reOff" : ""}
