const Op = require('swarm-ron');
const Frame = Op.Frame;
const Iterator = Frame.Iterator;
const Stream = Op.Stream;
const RDT = require('swarm-rdt');
const UUID = require('swarm-ron-uuid');

/** Linearizer. */
class Server extends Stream {

    /**
     *
     * @param options {Object} -- {pubsub,log,loglets,store}
     */
    constructor (options) {
        super();
        /** @type {Stream} */
        this.pubsub = options.pubsub||null;
        /** @type {Stream} */
        this.log_store = options.log||null;
        /** @type {Stream} */
        this.loglet_store = options.loglet||null;
        /** @type {Stream} */
        this.state_store = options.store||null;

    }

    on (query, stream) {
        for(const i = new Iterator(query); i.op; i.nextOp()) {
            const type = i.op.type;
            const fn = RDT.TYPES[type];
            if (!fn) {
                stream.update(new Op(
                    i.op.type, i.op.object, UUID.ERROR, i.op.event, ">NOTYPE"
                ).toString());
                continue;
            //} else if (last event defense) {
            } else if (0!==(fn.FEATURES|RDT.IS.OP_BASED) && this.loglet_store) {
                if (i.op.location.isZero()) {
                    this.state_store.on(i.op.toString(), stream);
                } else {
                    this.loglet_store.on(i.op.toString(), stream);
                } // FIXME
            } else if (this.state_store && (0!==(fn.FEATURES|RDT.IS.STATE_BASED) || i.op.location.isZero())) {
                this.state_store.on(i.op.toString(), stream);
            } else {
                stream.update(new Op(
                    i.op.type, i.op.object, UUID.ERROR, i.op.event, ">NOWAY"
                ).toString());
                continue;
            }
            if (this.pubsub)
                this.pubsub.on(i.op.toString(), stream);
        }
    }

    off (query, stream) {
        if (this.pubsub)
            this.pubsub.off(query, stream);
    }

    push (frame) {
        for(const i = new Iterator(frame); i.op; i.nextOp()) {
            // TODO vv defense
            // TODO last event defense
        }
        if (this.state_store)
            this.state_store.push(frame);
        if (this.pubsub)
            this.pubsub.push(frame);
        if (this.loglet_store)
            this.loglet_store.push(frame);
        if (this.log_store)
            this.log_store.push(frame);

    }

    update (frame) {
        // only for log echo
        // sync: send to full log subscribers?
    }

}

class MemStateStore extends Stream {
    constructor () { // FIXME use Store
        super();
        this.store = Object.create(null);
    }
    on (query, stream) {
        for(const q = new Iterator(query); q.op; q.nextOp()) {
            const key = q.op.key();
            const state = this.store[key] || key+"!";
            stream.update(state, this);
        }
    }
    push (frame) {
        const i = new Iterator(frame);
        const key = i.op.key();
        if (i.op.isHeader() && i.op.location.isZero()) {
            if (key in this.store) {
                console.warn('state overwrite attempt', frame);
            } else {
                this.store[key] = frame;
            }
        } else if (i.op.isHeader()) {
            const state = this.store[key] || key+'!';
            this.store[key] = RDT.reduce(state, frame);
        } else {
            const state = this.store[key] || key+'!';
            this.store[key] = RDT.reduce(state, frame);
        }
    }
}

class MemLogletStore extends Stream {
    constructor () {
        super();
        this.tails = Object.create(null);
    }
    push (frame) {
        const i = new Iterator(frame);
        const key = i.op.key();
        const tail = this.tails[key] || new Frame();
        if (i.op.isHeader())
            i.nextOp();
        while (i.op) {
            tail.push(i.op);
            i.nextOp();
        }
        this.tails[key] = tail;
    }
    on (query, stream) {
        const q = new Iterator(query);
        const key = q.op.key();
        const tail = this.tails[key];
        if (!tail) {
            stream.update(key+'!');
            return;
        }
        const from = q.op.location;
        const i = new Iterator(tail);
        while (i.op && !i.op.event.eq(from)) {
            i.nextOp();
        }
        if (!i.op) {
            stream.update(key+'!');
            return;
        }
        i.nextOp();
        let ret = new Op(
            q.op.type,
            q.op.object,
            UUID.ZERO, // TODO
            i.op.event,
            Op.FRAME_SEP
        ).toString();
        while (i.op) {
            ret = RDT.reduce(ret, i.op.toString());
            i.nextOp();
        }
        stream.update(ret.toString());
    }
}

class MemPubSub extends Stream {
    constructor () {
        super();
        this.subs = Object.create(null);
    }
    push (frame) {
        const i = new Iterator(frame);
        const subs = this.subs[i.op.key()];
        subs && subs.forEach( stream => stream.update(frame, this) );
    }
    on (query, stream) {
        for(const q = new Iterator(query); q.op; q.nextOp()) {
            let subs = this.subs[q.op.key()];
            if (!subs)
                subs = this.subs[q.op.key()] = [];
            subs.push(stream);
        }
    }
    off (query, stream) {
        for(const q = new Iterator(query); q.op; q.nextOp()) {
            let subs = this.subs[q.op.key()];
            if (!subs) continue;
            const i = subs.indexOf(stream);
            if (i===-1) continue;
            subs.splice(i,1);
        }
    }
}

Server.DefaultPubsub = MemPubSub;
Server.DefaultStore = MemStateStore;
Server.DefaultLoglets = MemLogletStore;
Server.Store = require('./store');

module.exports = Server;