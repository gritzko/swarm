## UIDs

(from https://github.com/gritzko/swarm-ron-docs/tree/2.0)

Swarm RON UIDs are roughly equivalent to [RFC4122 Version 1 UUIDs][uuid].
These are 128-bit logical timestamps serving as globally unique identifiers to *anything*.
RON UIDs employ different formats mostly to achieve better compression.

Regular RON UIDs have two components: *time* (calendar time) and *origin* (process/replica id).
Both parts are [64-bit ints](int.md).
Transcendent UIDs have origin of 0.
Those are global constants precisely defined mathematically, hence independent of any origin or time.

As UIDs are extensively used in the protocol, the format is made as compact as possible, while preserving human readability.
RON UIDs are serialized in [Base64](int.md) instead of decimal or hex.
Also, the full 128-bit bit capacity is often excessive, so unnecessary tail bits are zeroed and trimmed.

UIDs are serialized to Base64 as two [Base64x64 ints](int.md) using `-` as a pair separator, e.g. `1CQKneD1-X~` (time `1CQKneD1`, origin replica id `X~`).

### Time part format

Swarm timestamps are Gregorian calendar based, not milliseconds-since-epoch because they are [hybrid][hybrid] (logical, but calendar-aware).
Intuitive understanding of timestamps is a higher priority than easy calculation of time intervals.

Timestamp values have the `MMDHmSssnn` format.
Namely, ten 6-bit values encode months-since-epoch, days, hours, minutes, seconds, milliseconds and an additional sequence number.
The resulting bit loss is tolerable (no month is 64 days long).
In case of Base64 serialization, those ten positions correspond to ten Base64 chars.
With binary serializations, those are lower 60 bits of a 64-bit integer.

The resulting resolution is ~4mln timestamps per second, which is often excessive.
It is OK to shorten timestamps by zeroing the tail (sequence number, milliseconds, etc).
For example, `1CQAneD` is 7 chars and `1CQAn` is 5 chars (`MMDHm`, no seconds - Fri May 27 20:50:00 UTC 2016)

Time value of `~` means "infinity"/"never".
Time value of `~~~~~~~~~~` means "error".

### Origin part format

In general, RON accepts any 60-bit globally unique replica identifiers.
It is OK to use MAC addressses or random numbers.

Still, it is strongly recommended to use hierarchical [replica ids](replica.md) of four parts: peer id, server id, user id and session id bits.
For example, in the [0163 scheme](replica.md), replica id `Xgritzk0_D` has server id `X`, user id `gritzk` and session id `0_D`.


Theoretically, Swarm RON UIDs are based on a product of two very basic models: Lamport timestamps and process trees.
It is like sequential processes (replicas) exchanging messages asynchronously AND those processes can fork off child replicas.

### Transcendent UID format

Transcendent values use arbitrary 60-bit values.
Typically, those are short human-readable strings in [Base64x64](int.md), e.g. `inc`, `sum`, `txt` and so on.
A bit counter-intuitively, all such constants (like reducer UIDs) are *very* big numbers.
For example, `inc` [decodes](int.md) to 824893205576155136.


[lamport]: https://en.wikipedia.org/wiki/Lamport_timestamps
[hybrid]: https://www.cse.buffalo.edu/tech-reports/2014-04.pdf
[mslamp]: http://research.microsoft.com/en-us/um/people/lamport/pubs/time-clocks.pdf
[uuid]: https://tools.ietf.org/html/rfc4122#section-4.2
