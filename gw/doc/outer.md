# Swarm outer protocol

An imaginary dialog in the Swarm-Outer protocol. Swarm-Outer exchanges outer
states, no CRDT metadata. All the CRDT/op magic happens on the server side,
the client only consumes snapshots.

The protocol is mostly based on the regular line-based Swarm protocol,
with some simplifications. The key change is that the state is only passed
around as a snapshot (the outer state only, with no ops and no CRDT metadata
included)

All operations are uppercase to distinguish them from "regular" Swarm ops
(.on, .state, .off, etc). Every op is a specifier-value pair.
The specifier format is the same: /Type#id!timestamp.operation see
[the post](http://swarmjs.github.io/articles/lamport/) for details.

## Unabbreviated full-specifier dialog

Every connection starts with a handshake. Each side of the handshake assigns
the connection a new unique id (a Lamport timestamp). For, example, an app
`app` on a device `dev` of user `gritzko` has a session id of
`gritzko~dev~app`.
It connects to the local Swarm caching daemon (session id `gritzko~dev`):

    -> /Host#solu!2whC2+gritzko~dev~app.ON
    <- /Host#solu!2whC2001+gritzko~dev.ON

Timestamps correspond to Fri Jul 24 2015 14:12:09 GMT+0300 (EEST) or so.
The name of the database is `solu`.
Further on, the client app subscribes to an object `#2wADf+gritzko~web~app`.
As we see, that object was created by the same user in a different session
(likely through a web app interface).

    -> /Model#2wADf+gritzko~web~app!2whC2+gritzko~dev~app.ON

The daemon responds with the state (there is likely a delay here, as the
state may need to be fetched from the server):

    <- /Model#2wADf+gritzko~web~app!2whC2+gritzko~dev~app.STATE {"x":10,"y":20}

Later on, once the state changes, the app may receive an update:

    <- /Model#2wADf+gritzko~web~app!2whC2+gritzko~dev~app.STATE {"x":11, "y":21}

 The app may change the object itself and submit a state; the daemon will
 diff it to the current state, detect changes and save/send it as needed:

    -> /Model#2wADf+gritzko~web~app!2whC2+gritzko~dev~app.STATE {"x":11, "y":22}

Eventually, the app decides to create a new object and submit it.
Note that the timestamp matches the object id.

    -> /Model#2whId+gritzko~dev~app!2whId+gritzko~dev~app.STATE {"x":1, "y":2}
    -> /Model#2whId+gritzko~dev~app!2whC2+gritzko~dev~app.ON

At some point, the app unsubscribes from the object. That likely triggers a
chain of unsubscription events all along the chain up to the root server.

    -> /Model#2wADf+gritzko~web~app!2whC2+gritzko~dev~app.OFF

## Abbreviated-specifier dialog

The full-specifier protocol is a bit painful to read. We may create an
abbreviated version based on simple line-by-line abbreviation rules:

* no !stamp => assume the connection's !timestamp
* no .op => asuume .ON
* no /Type => assume /Model
* no #id => assume creation of a new object
* creation of a new object also implies a subscription

The same dialog, abbreviated:

    -> .ON
    <- !2whC2001+gritzko~dev.ON

    -> #2wADf+gritzko~web~app.ON
    <- #2wADf+gritzko~web~app.STATE {"x":10,"y":20}

    <- #2wADf+gritzko~web~app.STATE {"x":11, "y":21}
    -> #2wADf+gritzko~web~app.STATE {"x":11, "y":22}

    -> .STATE {"x":1, "y":2}
    <- #2whId+gritzko~dev~app.STATE {"x":1, "y":2}

    -> #2whId+gritzko~dev~app.OFF

## Collections

Collections are a bit too heavy to pass them by value on every change. Hence, objects are serialized as their ids:

    <- /Collection#2wA4k+gritzko~dev.STATE {"ids": ["#2wADf+gritzko~web~app", "#2whId+gritzko~dev~app"], keys: null}

On collection change (elements added/removed) the entire data structure is resent.
Objects are sent separately:

    <- #2whId+gritzko~dev~app!2whId+gritzko~dev~app.STATE {"x":1, "y":2}
    <- #2wADf+gritzko~web~app.STATE {"x":11, "y":22}

Collection elements require no individual subscriptions. As long as an object is in a collection, its change events trigger state resend. Warning: in case an object is an element of two collections, the client will receive a change twice. In case that object is individually subscribed to, there will be three  messages.

When creating a new object or subscribing to a collection, the client may have difficulties matching request and responses. Thus, a client can add optional request ids to track which data corresponds to which request:

    -> !arbitrary_stamp.STATE {"x":1, "y":2}
    <- #2whId+gritzko~dev~app!arbitrary_stamp.STATE {"x":1, "y":2}

Note that duplicate messages will have different request ids corresponding to their original subscriptions.

## Inconsistencies (TODO)

* client assigns no ids as it has no clocks (everything ~dev~app)
* no version ids are communicated to a naive client (TODO optionally add Syncable.lastChange() to the state snapshot)
