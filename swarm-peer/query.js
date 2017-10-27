const RON = require('swarm-ron');
const Frame = RON.Frame;
const UUID = RON.UUID;
const Stream = RON.Stream; // TODO Flow?


class Query extends Stream {

    /**
     *
     * @param upstream {Stream}
     * @param query_frame {Frame}
     */
    constructor (upstream, query_frame) {
        super(upstream);
        /** @type {UUID} */
        this.root;
        /** @type {Number} */
        this.depth;
        /* { uuid: depth } */
        this.map = Object.create(null);
        /** @type {Stream} */
        this.sink;
        /** @type {Frame} */
        this.frame;
        this.upstream.on(this.root, this);
    }

    /**
     * @return {Array} -- array of UUIDs
     */
    objects () {

    }

    update (frame) {
        // check the sink is OK
        // HERE WE CAN'T SEE WHICH CONCURRENT WRITE WINS, EG
        // BE OPTIMISTIC
        // update the ref tree
        // this.frame.append(frame);
        // complete?
            // this.sink.update(this.frame);
        // update?
            // this.sink.update(frame);
    }

}

module.exports = Query;