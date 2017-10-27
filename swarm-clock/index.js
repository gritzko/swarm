"use strict";
const UUID = require('swarm-ron-uuid');

/** Pure logical clock. */
class Clock {

    /**
     * Create a new clock.
     * @param origin {String} - Base64x64 clock/process/replica id
     * @param options {Object} - various modes and options
     */
    constructor (origin, options) {
        this.origin = origin;
        this.last = UUID.ZERO;
        this.length = 5;
        if (options) {
            if (options.length)
                this.length = options.length;
            if (options.last)
                this.last = UUID.fromString(options.last.toString());
        }
    }

    /** Generates a fresh globally unique monotonous UUID.
     *  @return {UUID} */
    time () {
        let t = this.last.value;
        while (t.length<this.length) t+='0';
        let i = t.length-1;
        while (t[i]==='~' && i>=0) i--;
        if (i<0) return UUID.ERROR;
        const value = t.substr(0,i) + UUID.BASE64[UUID.CODES[t.charCodeAt(i)]+1];
        this.last = new UUID(value, this.origin);
        return this.last;
    }

    /**
     * See an UUID. Can only generate larger UUIDs afterwards.
     * @param uuid {UUID}
     */
    see(uuid) {
        if (uuid.ge(this.last))
            this.last = uuid;
    }
    
}

module.exports = Clock;