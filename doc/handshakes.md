# Handshakes

A downstream fork connects to its parent upstream replica to synchronize and accepts connections from its own downstreams.
That forms a replica tree (which is not always a tree).
A connection is started with a handshake that has a format of a regular [op][protocol], having spec, value and patch parts.
A downstream handshake op introduces the downstream, provides necessary details and credentials, etc.
It is responded by an upstream handshake op that synchronizes clocks and propagates metadata.
A handshake can be "refreshed" later on if some data needs to be updated.
A connection ends with a closing handshake.
[protocol]: ./protocol.html

## Specifier

`/Swarm+ShardRing#database+ShRD!mytime+˜1.on`
A handshake specifier contains:
* the "Swarm" code word
* replica's *role* (like Client, Ring, Slave, [see the doc][fork])
* *name* of the database
* *shard* of the database (for Rings only)
* connection's *source* id, which is a timestamp like `mytime+joe~i4`, where
    1. `mytime` is a current timestamp provided by the upstream (downstream does not provide its time)
    2. downstream replica id `joe~i4`,
* the op name `.on` (can be omitted), `.off` (closing handshake) or `.error` (denied handshake or connection abort).

Handshakes can occur between local components, e.g. a host (a container of API objects) can connect to a local replica:
```
> /Swarm+Host#test!joe~1x.on
< /Swarm+Client#test!3uHRl+joe~1x.on
```
The upstream's response contains a valid (full) source id for the connection.
That way, the upstream signals that it accepts the downstream connection and sets the correct time (the upstream is always right, in that regard, the downstream must adapt).
The downstream may no know its replica id or its database name yet.
In such a case, zeroes (`!0` and/or `#0`) are provided; the upstream responds with correct values, e.g.
```
> /Swarm+Slave#0!0.on
< /Swarm+Ring#database!3uHRl+~1x.on
```
[fork]: ./fork.html

## Value

The value part of a handshake op may contain a progress acknowledgement needed for reconnections.
A new connection needs to send all the subscriptions upstream, which is especially annoying on a flapping WiFi, for example.
As an optional feature, both replicas may keep all the operations sent in a local log till they are acknowledged.
On reconnection, the downstream supplies the source id of the interrupted connection, each side acknowledges the last received operation, so all the later operations are retransmitted.
A replica signals its support for reconnections by mentioning an acknowledgement of `0 !0` (no previous connection, on ops received) in its opening handshake.
Reconnections are critical for Clones as they subscribe to databases in bulk, without providing versions of individual objects.
```
> /Swarm+Clone#database!jane~3.on  3uAk4+jane~3 !3uE3s+jane~3
< /Swarm#database!3uHRl+jane~3.on  3uE3s+jane~3
```

## Patch

The patch part of the handshake op contains *options* which is various database-specific metadata, like timestamp format, access policy, auth tokens and suchlike.
Options are serializes as operations:
```
> /Swarm+Client#database!0.on
>     .Secret            mmdH_GJZqjdKtOG7AwdLbsZyz5k
< /Swarm+Ring#database!3uHRl+~1~c3po.on
<     .TimestampFormat   Adaptable
```
Options propagate strictly downstream, although a client may send some options upwards for inspection (e.g. its access token).
There are rules regarding which options get into a particular kind of fork.
Note that replica's clocks are only created after an upstream handshake and with no clocks, no ops are created.
Hence, a replica gets all the vital settings: access rights, timestamp format, other db specific details, before it does any writes.
