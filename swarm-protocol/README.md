# Swarm protocol primitives #

This package implements the Swarm protocol primitives according to the
specification http://gitbook.com/book/gritzko/swarm-the-protocol

* Base64x64 - 64-bit numbers in Base64
* Stamp - hybrid logical time stamps ([timeStamp, replicaId] pairs)
* Clock - hybrid clocks (Stamp factory, one replica has one Clock only)
* Spec - specifiers (compound event/op identifiers)
* Op - immutable ops (operations, events) that express all mutations
* VV - version vectors (practically, {replicaId: maxTimeStamp} maps)
* ImmutableVV - immutable version vector

All classes but VV are immutable.
Everything is parsed from a string, serialized to a string (all
constructors accept toString() output).

see test/ for API use examples.
