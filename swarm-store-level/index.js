const RON = require('swarm-ron');
const Peer = require('swarm-peer');
const Stream = RON.Stream;
const Store = Peer.Store;


class LevelStore extends Store {

    constructor (leveldown, options) {
        super();
        this.store = leveldown;
        this.timeout = null;
        this.callback = null;
        this.batch = [];
    }


    /**
     *
     * @param key {String}
     * @param fn {Function} - fn(value)
     */
    get (key, fn) {

    }

    /**
     * Reads all key-values in the [from, till) interval.
     * @param from {String}
     * @param till {String}
     * @param fn {Function}
     * @return {Array} -- `[{key:x, value:y}]` array
     */
    getAll (from, till, fn) {

    }

    /**
     * Schedules a key-value pair for a commit
     * @param key {String}
     * @param val {String}
     */
    put (key, val) {
        if (!this.timeout)
            setTimeout(() => this.commit(), 1);
    }

    /**
     *
     * @param key {String}
     */
    del (key) {

    }

    /**
     * Install a completion callback
     * @param event {String} - normally, "done"
     * @param fn {Function}
     */
    on (event, fn) {

    }

    commit () {
        const batch = this.batch;
        this.batch = [];
        this.store.batch(batch, err => {
            this.callback && this.callback(err);
        });
    }

}