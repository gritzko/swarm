# Swarm protocol primitives #

This package implements Swarm Replicated Object Notation (RON) according to
the specification https://gritzko.gitbooks.io/swarm-the-protocol/content/

* Base64x64 - 64-bit numbers in Base64
* UID - hybrid/logical UUIDs [timestamp, replica\_id]
* Clock - hybrid clocks (UID factory)
* Op - immutable op
* Frame - op frame

see test/ for API use examples.
