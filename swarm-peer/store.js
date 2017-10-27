/** Lockstep-commit store. Once all reads are processed, commits. */
class Store {

    constructor () {

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

}

module.exports = Store;