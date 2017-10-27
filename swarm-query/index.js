const RON = require('swarm-ron');
const Frame = RON.Frame;
const UUID = RON.UUID;
const Stream = RON.Stream; // TODO Flow?

/** Handles complex recursive/batch queries.
 *  Subscription state machine is always per-object-form.
 *  Query creates a "graph closure" object form so a client
 *  can conveniently subscribe to a graph.
 *
 *  > .graph#root@~:0? .lww#child:version
 *
 *  < .graph#root@version! .lww#root! ... .lww#child@patch! ...
 *
 *  > .json$graph
 *
 *  Also, see pools:
 *
 *  > .pool#poolid@seq?
 *
 * */
class Query extends Stream {

    /**
     *
     * @param upstream {Stream}
     * @param query_frame {Frame}
     */
    constructor (upstream, query_frame, pub_query) {
        super(upstream);
        /** @type {UUID} */
        this.root;
        /** @type {Number} */
        this.depth;
        /** @type {Object} -- { uuid: depth } */
        this.reach = Object.create(null);
        /** @type {Stream} */
        this.sink;
        /** @type {Frame} */
        this.incomplete;
        this.reach[this.root] = 0;
        this.upstream.on(this.root, this);
    }

    on (query) {
        // multiple queries :(
        this.root = query.op;
        this.upstream.on(simple_query);
    }

    off (query) {
        if (!this.root.object.eq(query.op.object)) {

        }
        // unsub all
        this.disconnect();
    }

    update (cursor) {
        // check the sink is OK
        const depth;
        // HERE WE CAN'T SEE WHICH CONCURRENT WRITE WINS, EG
        // BE OPTIMISTIC
        if (depth<this.depth) {
            while (cursor.op) {
                if (cursor.op.hasLink()) {
                    const next_id;
                    if (this.reach[next_id]) {}
                    this.reach[next_id] = cur_depth+1;
                    this.upstream.on(next_id, this);
                }
                cursor.nextOp();
            }
        }
        // update the ref tree
        if (this.incomplete) {
            this.incomplete.append(frame);
            if (1) {
                this.sink.update(this.incomplete);
                this.incomplete = null;
            }
        } else {
            this.sink.update(frame);
        }
    }

}


module.exports = Query;