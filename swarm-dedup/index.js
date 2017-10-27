const RON = require('swarm-ron');
const Flow = RON.Flow;

class Dedup extends Flow {

    constructor (upstream) {
        super(upstream);
        /** @type {Object} -- { uuid : count } */
        this.subs = Object.create(null);
        /** @type {Flow} */
        this.sink = null;
        /** @type {Array} */
        this.pool = [];
        /** @type {Object} -- {uuid:true} */
        this.pooled = null;
    }

    on (query, sink) {
        if (!this.sink) {
            this.sink = sink;
        } else if (this.sink!==sink) {
            sink.update(error);
            return;
        }
        this.upstream.on(query, this);
    }

    off (query, sink) {
        if (sink!==this.sink) {
            sink.update(error);
        } else {
            this.upstream.off(query, this);
        }
    }

    flush () {
        const send = this.pool;
        this.pool = [];
        this.pooled = null;
        this.pool.forEach( f => this.sink.update(f) );
    }

    queue (frame) {
        if (this.pooled===null) {
            this.pooled = Object.create(null);
            setTimeout( () => this.flush(), 1 );
        }
        if (uuid in this.pooled) {

        } else {
            this.pool.push(frame);
            this.pooled[uuid] = true;
        }
    }

    update (frame) {
        // trick: calculate off
        // cases: map, state/reon, reoff, op
        this.queue(frame);
    }

}
