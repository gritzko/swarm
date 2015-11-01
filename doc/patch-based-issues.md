# Issues with the patch-based approach

There are 4 general frameworks for data synchronization:
1. patch-based (like diff-match-patch, also recursive its generalizations)
   used by Apple iCloud, Wunderlist, ProseMirror and others;
2. operational transforms (OT), used by Google Docs/Apps;
3. conflict-free replicated data types, used by Riak (and Swarm),
   TomTom has custom solution for relaying CRDTs to the client side;
4. something improvised (which is typically not that good, CouchDB+pouchdb
   duo pushes the user precisely in this direction).

This document outlines difficulties of the patch-based approach, based on
conversations with people who implemented it in various products, and own
first-hand experiences.

Pros of patch based:
* the approach is classic and well-understod, used daily by every
  developer;
* it only transfers the delta over the network, which is much better
  than transferring the entire state (like in Riak state-based CRDTs or
  CouchDB+pouchdb);
* one can get surprisingly far by generalizing good old patches (Apple
  iCloud did that; they use generalized object-tree patches).

Cons:
* patches are less deterministic, as the "match" part employs heuristics,
  it gets worse when the approach is generalized from a linear text to
  a tree of arbitrary objects;
* client's model needs to stay in memory on the server side, as every
  client's patch needs to be checked against the full model (pinned RAM
  is a big scalability impediment);
* not all data structures are conveniently expressed using diff/patch
  logic, e.g. counters;
* push-a-patch model is inherently oriented towards two-tier
  architecture (one client speaks to one server); that impedes horizontal
  scaling and excludes multi-tier architectures (proxies, caches, etc)
* finally, diff-match-patch assumes lower event frequencies; it is not
  naturally real-time.

More on the real time aspect. As the client pushes a delta against the
server's "head" version, any concurrent change makes the client-side
"head" obsolete. So, the client has to re-fetch the server's head to push
its changes again. That becomes an issue when events keep coming faster
than the client can update its head. Quite likely, Google switched to OT
once they faced such effects in Google Docs.
One possible solution is to implement 3-way merge at the server side;
that is equivalent to running git in real-time mode. Quite an
unpleasant experience, I believe, as git did not assume that every new
keystroke makes a new version of a document.


Swarm's CmRDTs solve all of the mentioned issues:
* data types are very deterministic math,
* it only moves differences over the wire,
* dumb server, mostly write only db, no pinned RAM,
* an extensive library of data structures,
* multi-tier architectures are OK; the only essential requirement is
  that all ops reach all replicas,
* real-time is perfectly natural.


                                        gritzko, 1 Nov 2015, TXL
