# Swarm: Level.js based storage
keeps oplogs and states, makes patches

Storage is responsible for keeping operation logs and state snapshots and doing
all the log-related work. Router, Host and Syncables can only see the log on
op-by-op basis, so all incoming ops are first filtered by a Storage to detect
replays.

Swarm storage works by a request-response pattern: every incoming subscription
is responded with a log tail, every operation, if new, is stored and relayed
back.

This implementation puts operations and state snapshots into a Level.js
database, which is normally LevelDB-backed (server-side) or IndexedDB-backed
(client-side).

Normally, a storage talks to a Router (which does multiplexing to local Host
and remote subscribers). Storage responds to every incoming subscription (.on)
with an object state or a log tail or both or neither. That response is always
a .diff. The response is followed by a reciprocal subscription (.on) unless
the request was reciprocal itself.

The .deliver(op) interface is the same all along the chain
(Syncable <-> Host <-> Router <-> Storage).

A Storage relies on its underlying storage engine to actually persist and
retrieve the data. We imply an ordered key-value storage engine implementing
the LevelUp interface (get, put, createReadStream, see
https://github.com/Level/levelup)
All the versioning related machinery is too much nitty-gritty to reliably
replicate it for every key-value backend, so Storage does it all.

Operations, state snapshots and other records are stored under string keys
that form an alphanumeric total order:

                     ┌←┐  ┌──←┐
    0────────────s─────┴───s──┴──s─────>
                                   ^...    .on(bookmark) response
                          .  ^.........    .on(bookmark) response hits a backref
                                 ......    .on('') response
       . .  .. ..   ... ...............    .on(!version!vector) response ☠

    0  zero state (not stored)
    ─  operations (log)
    ┴  backreferences
    ^  (remote) log bookmark
    s  state snapshots
    >  manifest record

Note that the "hot" zone is the latest state snapshot and recent operations (aka log tail). Those group together. There is a fixed-key "manifest" record that stores the version of the last snapshot. We need to read that one quite often, contrary to historical ops that are rarely retrieved.

Record keys are base64' specifiers:

    state snapshot key:
        /Type#id!serial!timeseq+src!time+src.state   json
    op key:
        /Type#id!timeseq+src.op   something
    backreference:
        /Type#id!prev+src~ssn.~br     !lateop+src1!lateop+src2

    manifest:
        /Type#id.base     !0
        /Type#id.recent   !state!state+src!state+src
    peer bookmark (what to request):
        /Type#id.bm&source~ssn   received+sou~rce
    echo bookmark (what to send):
        /Type#id.ebm&source~ssn   echo+mi~ne

