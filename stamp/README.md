Base64 Lamport timestamps
=========================

![events](https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Vector_Clock.svg/750px-Vector_Clock.svg.png)

The package implements Base64 string Lamport timestamps. First described in ["Time, clocks, and the ordering of events in a distributed system"][paper] by Leslie Lamport these timestamps are designed to track events in a distributed system.
The paper's primary inspiration was the special theory of relativity.
It describes a model of time based on sequential communicating processes each having its local clocks only, no "newtonian" global universal clocks.

Hence, every timestamp has two components:

* monotonically increasing "clock" and
* process identifier.

These days, Lamport timestamps are used everywhere, starting from multicore CPUs all the way to world-scale distributed systems.

This implementation deals with base64 string based timestamps of variable length. Those are handier and more flexible than C-style fixed-width binary formats. Base64 can be used inside URLs (path/fragment parts), logs, arbitrary databases, etc.
Importantly, Base64 timestamps are human readable.

The clock component may be a simple sequential counteror a timestamp from a physical clock (data/time) or something inbetween or combined. (There are lots of fine details here.)
Classes:

* TestClock (sequential counter)
* MinuteClock (timestamp + sequence number, exact to a minute)
* SecondClock (timestamp + sequence number, exact to a second)
* AdabtableClock (timestamp + sequence number, long enough to guarantee uniqueness and monotonic growth)

Base64 timestamps obey alphanumeric order, that's why the package employs its own variety of base64. In common [base64 variants][base64], numeric order does not match alphanumeric order (i.e. the order for numbers and their base64 serializations differs).

swarm base64: `0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~`

The package also implements two varieties of version vector based on Base64 Lamport timestamps:

* regular version vector (VVector, which is actually a map) and
* arrival order preserving version vector (OrdVVector).

See tests for usage examples.

[paper]: http://amturing.acm.org/p558-lamport.pdf
[base64]: https://en.wikipedia.org/wiki/Base64#Variants_summary_table
